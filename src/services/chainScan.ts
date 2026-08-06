import 'server-only';
import { getAddress, numberToHex, hexToBigInt, type Hex } from 'viem';
import { getPublicClient, ERC20_ABI } from '@/lib/chain/wallet';
import { logger } from '@/lib/logger';
import type { ChainScanResult, DiscoveredContract, ContractKind } from '@/domain/types';

// keccak256("Transfer(address,address,uint256)") — shared by ERC-20 & ERC-721.
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hex;
// keccak256("TransferSingle(address,address,address,uint256,uint256)") — ERC-1155.
const TRANSFER_SINGLE = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62' as Hex;
// A zero address padded to a 32-byte topic (mint = transfer FROM the zero address).
const ZERO_TOPIC = `0x${'0'.repeat(64)}` as Hex;

const ERC165_ABI = [
  { type: 'function', name: 'supportsInterface', stateMutability: 'view', inputs: [{ name: 'id', type: 'bytes4' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const;

const IFACE_ERC721 = '0x80ac58cd' as Hex;
const IFACE_ERC1155 = '0xd9b67a26' as Hex;

const DEFAULT_BLOCKS = 10_000;
const MAX_BLOCKS = 100_000;
/** Cap how many distinct contracts we classify per scan (bounds RPC calls). */
const MAX_CLASSIFY = 24;

let cache: { at: number; blocks: number; result: ChainScanResult } | null = null;
const CACHE_TTL_MS = 20_000;

/**
 * Scan the last `blocks` blocks for mint events and return the distinct
 * NFT/token contracts that minted, newest activity first. Uses the RPC only
 * (no wallet key needed).
 */
export async function scanNewContracts(blocks = DEFAULT_BLOCKS): Promise<ChainScanResult> {
  const span = Math.min(Math.max(Math.floor(blocks) || DEFAULT_BLOCKS, 100), MAX_BLOCKS);

  if (cache && cache.blocks === span && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.result;
  }

  const client = getPublicClient();
  let latest: bigint;
  try {
    latest = await client.getBlockNumber();
  } catch (err) {
    logger.warn('chainScan.rpc_unreachable', { error: String(err) });
    return {
      contracts: [],
      fromBlock: 0,
      toBlock: 0,
      scannedAt: new Date().toISOString(),
      note: 'RPC unreachable — set RPC_URL to a working Robinhood endpoint (the free public RPC may be rate-limited).',
    };
  }

  // Collect mint logs, shrinking the range if the RPC rejects it (too wide).
  let window = BigInt(span);
  let logs: Array<{ address: string; blockNumber: bigint | null }> = [];
  let fromBlock = latest;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    fromBlock = latest > window ? latest - window : 0n;
    const range = { fromBlock: numberToHex(fromBlock), toBlock: numberToHex(latest) };
    try {
      const [erc, single] = await Promise.all([
        client.request({ method: 'eth_getLogs', params: [{ ...range, topics: [TRANSFER, ZERO_TOPIC] }] }),
        client
          .request({ method: 'eth_getLogs', params: [{ ...range, topics: [TRANSFER_SINGLE, null, ZERO_TOPIC] }] })
          .catch(() => [] as { address: Hex; blockNumber: Hex | null }[]),
      ]);
      logs = [...erc, ...single].map((l) => ({
        address: l.address,
        blockNumber: l.blockNumber ? hexToBigInt(l.blockNumber) : null,
      }));
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      window /= 2n; // range likely too large — shrink and retry
    }
  }
  if (lastErr) {
    logger.warn('chainScan.getLogs_failed', { error: String(lastErr) });
    return {
      contracts: [],
      fromBlock: Number(fromBlock),
      toBlock: Number(latest),
      scannedAt: new Date().toISOString(),
      note: 'Could not read mint logs from the RPC (range too large or RPC unavailable). Try fewer blocks.',
    };
  }

  // Distinct contract addresses, keeping the most recent mint block.
  const seen = new Map<string, bigint>();
  for (const l of logs) {
    const a = l.address.toLowerCase();
    const b = l.blockNumber ?? 0n;
    const prev = seen.get(a);
    if (prev === undefined || b > prev) seen.set(a, b);
  }

  const ranked = [...seen.entries()].sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0)).slice(0, MAX_CLASSIFY);
  const contracts = await Promise.all(ranked.map(([addr, block]) => classify(addr, block, fromBlock)));
  // Brand-new deployments (no code at the window start) float to the top.
  contracts.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || b.lastBlock - a.lastBlock);

  const result: ChainScanResult = {
    contracts,
    fromBlock: Number(fromBlock),
    toBlock: Number(latest),
    scannedAt: new Date().toISOString(),
    note: seen.size > MAX_CLASSIFY ? `${seen.size} contracts minted; showing the ${MAX_CLASSIFY} most recent.` : undefined,
  };
  cache = { at: Date.now(), blocks: span, result };
  logger.info('chainScan.done', { minted: seen.size, classified: contracts.length, span });
  return result;
}

async function classify(addrLower: string, block: bigint, fromBlock: bigint): Promise<DiscoveredContract> {
  const client = getPublicClient();
  const address = getAddress(addrLower);
  let kind: ContractKind = 'unknown';
  let decimals: number | null = null;

  // Brand-new? No bytecode at the window's start block => deployed since then.
  // Best-effort: needs historical state, so a non-archive RPC just leaves it false.
  let isNew = false;
  try {
    const code = await client.request({ method: 'eth_getCode', params: [address, numberToHex(fromBlock)] });
    isNew = !code || code === '0x';
  } catch {
    /* non-archive node or transient error */
  }

  // ERC-20 exposes decimals(); NFTs revert on it.
  try {
    decimals = Number(await client.readContract({ address, abi: ERC20_ABI, functionName: 'decimals' }));
    kind = 'ERC-20';
  } catch {
    /* not an ERC-20 */
  }
  if (kind === 'unknown') {
    if (await supports(address, IFACE_ERC721)) kind = 'ERC-721';
    else if (await supports(address, IFACE_ERC1155)) kind = 'ERC-1155';
  }

  let symbol: string | null = null;
  let name: string | null = null;
  try {
    symbol = String(await client.readContract({ address, abi: ERC20_ABI, functionName: 'symbol' }));
  } catch {
    /* optional */
  }
  try {
    name = String(await client.readContract({ address, abi: ERC165_ABI, functionName: 'name' }));
  } catch {
    /* optional */
  }

  return { address, kind, name, symbol, decimals, lastBlock: Number(block), isNew };
}

async function supports(address: `0x${string}`, interfaceId: Hex): Promise<boolean> {
  try {
    return Boolean(
      await getPublicClient().readContract({ address, abi: ERC165_ABI, functionName: 'supportsInterface', args: [interfaceId] }),
    );
  } catch {
    return false;
  }
}
