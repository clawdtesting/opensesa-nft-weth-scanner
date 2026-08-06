import 'server-only';
import { isAddress, numberToHex, hexToBigInt, getAddress, type Hex } from 'viem';
import { getWalletAddress, getTokenBalance, getTokenMeta, getPublicClient } from '@/lib/chain/wallet';
import { logger } from '@/lib/logger';

// keccak256("Transfer(address,address,uint256)") — ERC-20 & ERC-721 transfers.
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hex;

export interface TokenInfo {
  address: string;
  symbol: string | null;
  decimals: number | null;
  /** Configured wallet's balance of this token (null if unreadable/no wallet). */
  balance: number | null;
  fetchedAt: string;
  note?: string;
}

export interface TokenPrice {
  address: string;
  /** Price in ETH per token, or null when no price source is available yet. */
  priceEth: number | null;
  at: string; // ISO timestamp of the sample
  note?: string;
}

/** Read on-chain metadata + the wallet's balance for a token. */
export async function getTokenInfo(addressRaw: string): Promise<TokenInfo> {
  const address = addressRaw.trim();
  const fetchedAt = new Date().toISOString();
  if (!isAddress(address.toLowerCase())) {
    return { address, symbol: null, decimals: null, balance: null, fetchedAt, note: 'Enter a valid token contract address.' };
  }

  const owner = getWalletAddress();
  const [meta, balance] = await Promise.all([
    getTokenMeta(address),
    owner ? getTokenBalance(address, owner) : Promise.resolve(null),
  ]);

  return {
    address,
    symbol: meta.symbol,
    decimals: meta.decimals,
    balance,
    fetchedAt,
    note: meta.symbol === null ? 'Token not found on Robinhood chain yet (or RPC unreachable). Keep trying — it will resolve once deployed.' : undefined,
  };
}

/**
 * Live price for a token, in ETH per token. This is the single place to wire a
 * price source once $MANCER is trading — e.g. a DEX pool (reserve ratio via
 * RPC) or a market data API. Until a source is configured it returns null so
 * the chart shows a "waiting for price" state instead of fabricated data.
 */
export async function getTokenPrice(addressRaw: string): Promise<TokenPrice> {
  const address = addressRaw.trim();
  const at = new Date().toISOString();
  if (!isAddress(address.toLowerCase())) {
    return { address, priceEth: null, at, note: 'Invalid token address.' };
  }

  // TODO(price-source): resolve a live price here once the token is live.
  // Options: read a DEX pool's reserves via viem, or call a market data API.
  return {
    address,
    priceEth: null,
    at,
    note: 'No price source wired yet — provide the DEX pool address (or a price API) once $MANCER is live.',
  };
}

// ---------------------------------------------------------------------------
// Trading activity — has it started, and how many transfers so far
// ---------------------------------------------------------------------------

export interface TokenActivity {
  address: string;
  hasCode: boolean;
  deploymentBlock: number | null;
  deployedAt: string | null; // ISO
  tradingStarted: boolean;
  firstTransferBlock: number | null;
  firstTransferAt: string | null; // ISO — the "started trading" moment
  lastTransferBlock: number | null;
  lastTransferAt: string | null;
  transferCount: number;
  /** True when the transfer count hit the scan cap (real total is higher). */
  capped: boolean;
  toBlock: number;
  scannedFrom: number;
  fetchedAt: string;
  note?: string;
}

const LOOKBACK_FALLBACK = 300_000n; // when the deployment block can't be found
const CHUNK = 10_000n; // getLogs range per request
const MAX_TRANSFERS = 5_000; // stop counting past this (bounds cost)

/** Watch a token: is it deployed, has trading started, and the transfer count. */
export async function getTokenActivity(addressRaw: string): Promise<TokenActivity> {
  const address = addressRaw.trim();
  const fetchedAt = new Date().toISOString();
  const empty: TokenActivity = {
    address,
    hasCode: false,
    deploymentBlock: null,
    deployedAt: null,
    tradingStarted: false,
    firstTransferBlock: null,
    firstTransferAt: null,
    lastTransferBlock: null,
    lastTransferAt: null,
    transferCount: 0,
    capped: false,
    toBlock: 0,
    scannedFrom: 0,
    fetchedAt,
  };
  if (!isAddress(address.toLowerCase())) return { ...empty, note: 'Invalid token address.' };

  const client = getPublicClient();
  const addr = getAddress(address.toLowerCase());

  let latest: bigint;
  try {
    latest = await client.getBlockNumber();
  } catch (err) {
    logger.warn('token.activity_rpc_down', { error: String(err) });
    return { ...empty, note: 'RPC unreachable — set RPC_URL to a working Robinhood endpoint.' };
  }

  const codeNow = await client.request({ method: 'eth_getCode', params: [addr, numberToHex(latest)] }).catch(() => '0x');
  const hasCode = Boolean(codeNow) && codeNow !== '0x';
  if (!hasCode) {
    return { ...empty, toBlock: Number(latest), note: 'Contract not deployed on Robinhood chain yet — keep watching.' };
  }

  // Best-effort exact deployment block (needs an archive RPC).
  const deploymentBlock = await findDeploymentBlock(addr, latest).catch(() => null);
  const scanFrom = deploymentBlock ?? (latest > LOOKBACK_FALLBACK ? latest - LOOKBACK_FALLBACK : 0n);

  const { count, first, last, capped } = await countTransfers(addr, scanFrom, latest);

  const [deployedAt, firstTransferAt, lastTransferAt] = await Promise.all([
    deploymentBlock !== null ? blockTime(deploymentBlock) : Promise.resolve(null),
    first !== null ? blockTime(first) : Promise.resolve(null),
    last !== null ? blockTime(last) : Promise.resolve(null),
  ]);

  return {
    address: addr,
    hasCode: true,
    deploymentBlock: deploymentBlock !== null ? Number(deploymentBlock) : null,
    deployedAt,
    tradingStarted: count > 0,
    firstTransferBlock: first !== null ? Number(first) : null,
    firstTransferAt,
    lastTransferBlock: last !== null ? Number(last) : null,
    lastTransferAt,
    transferCount: count,
    capped,
    toBlock: Number(latest),
    scannedFrom: Number(scanFrom),
    fetchedAt,
    note: deploymentBlock === null ? 'Deployment block unknown (non-archive RPC) — counts are over a recent window.' : undefined,
  };
}

/** Binary-search the first block where the address has bytecode. */
async function findDeploymentBlock(addr: `0x${string}`, latest: bigint): Promise<bigint> {
  const client = getPublicClient();
  let lo = 0n;
  let hi = latest;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await client.request({ method: 'eth_getCode', params: [addr, numberToHex(mid)] });
    if (!code || code === '0x') lo = mid + 1n;
    else hi = mid;
  }
  return lo;
}

/** Count Transfer events for a token from `from`..`to`, chunked and capped. */
async function countTransfers(
  addr: `0x${string}`,
  from: bigint,
  to: bigint,
): Promise<{ count: number; first: bigint | null; last: bigint | null; capped: boolean }> {
  const client = getPublicClient();
  let count = 0;
  let first: bigint | null = null;
  let last: bigint | null = null;
  let cursor = from;
  while (cursor <= to) {
    const end = cursor + CHUNK - 1n > to ? to : cursor + CHUNK - 1n;
    let logs: { blockNumber: Hex | null }[];
    try {
      logs = await client.request({
        method: 'eth_getLogs',
        params: [{ address: addr, fromBlock: numberToHex(cursor), toBlock: numberToHex(end), topics: [TRANSFER] }],
      });
    } catch {
      return { count, first, last, capped: true }; // RPC rejected the range/results
    }
    for (const l of logs) {
      count += 1;
      const b = l.blockNumber ? hexToBigInt(l.blockNumber) : null;
      if (b !== null) {
        if (first === null || b < first) first = b;
        if (last === null || b > last) last = b;
      }
    }
    if (count >= MAX_TRANSFERS) return { count, first, last, capped: true };
    cursor = end + 1n;
  }
  return { count, first, last, capped: false };
}

async function blockTime(block: bigint): Promise<string | null> {
  try {
    const b = await getPublicClient().getBlock({ blockNumber: block });
    return new Date(Number(b.timestamp) * 1000).toISOString();
  } catch {
    return null;
  }
}
