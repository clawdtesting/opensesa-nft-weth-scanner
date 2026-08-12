import 'server-only';
import { getAddress, isAddress, parseEther, parseAbiItem, toFunctionSelector, type Address } from 'viem';
import { getPublicClient, getWalletClient, getWalletAddress } from '@/lib/chain/wallet';
import { buyerReady } from '@/config/env';
import { logger } from '@/lib/logger';

const BLOCKSCOUT = 'https://robinhoodchain.blockscout.com';
const EXPLORER_TX = 'https://robinhoodchain.blockscout.com/tx/';

// Common mint entry points to fingerprint when the ABI isn't verified.
const MINT_SIGS = [
  'mint()',
  'mint(uint256)',
  'mint(address,uint256)',
  'mint(uint256,address)',
  'publicMint(uint256)',
  'mintPublic(uint256)',
  'safeMint(address)',
  'claim(uint256)',
];
// Getters we try to read the per-item mint price from.
const PRICE_FNS = ['mintPrice', 'price', 'cost', 'PRICE', 'MINT_PRICE', 'publicPrice', 'publicSalePrice', 'salePrice'];
const SUPPLY_FNS = ['totalSupply', 'maxSupply', 'MAX_SUPPLY', 'maxTotalSupply'];

const uintView = (name: string) =>
  [{ type: 'function', name, stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const;

export interface MintCandidate {
  signature: string; // e.g. "mint(uint256)"
  source: 'abi' | 'bytecode';
}
export interface MintDetect {
  address: string;
  isContract: boolean;
  verified: boolean;
  verifiedName: string | null;
  candidates: MintCandidate[];
  priceWei: string | null;
  priceEth: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  executorReady: boolean;
  note?: string;
}

/** Inspect a mint contract: candidate mint functions, price, supply. */
export async function detectMint(addressRaw: string): Promise<MintDetect> {
  const address = getAddress(addressRaw.trim().toLowerCase());
  const client = getPublicClient();
  const base: MintDetect = {
    address,
    isContract: false,
    verified: false,
    verifiedName: null,
    candidates: [],
    priceWei: null,
    priceEth: null,
    totalSupply: null,
    maxSupply: null,
    executorReady: buyerReady(),
  };
  if (!isAddress(address.toLowerCase())) return { ...base, note: 'Invalid address.' };

  let code = '0x';
  try {
    code = (await client.request({ method: 'eth_getCode', params: [address, 'latest'] })) as string;
  } catch {
    return { ...base, note: 'RPC unreachable — set RPC_URL.' };
  }
  base.isContract = Boolean(code) && code !== '0x';
  if (!base.isContract) return { ...base, note: 'Not a contract (yet). If the mint hasn’t deployed, keep trying.' };

  const codeHex = code.toLowerCase();
  const candidates: MintCandidate[] = [];

  // Verified ABI (best): take every payable/nonpayable function whose name looks like a mint.
  try {
    const res = await fetch(`${BLOCKSCOUT}/api/v2/smart-contracts/${address}`);
    if (res.ok) {
      const body = (await res.json()) as {
        name?: string;
        is_verified?: boolean;
        abi?: Array<{ type?: string; name?: string; stateMutability?: string; inputs?: Array<{ type?: string }> }>;
      };
      base.verified = Boolean(body.is_verified);
      base.verifiedName = body.name ?? null;
      for (const f of body.abi ?? []) {
        if (f.type !== 'function' || !f.name) continue;
        if (!/mint|claim/i.test(f.name)) continue;
        if (f.stateMutability === 'view' || f.stateMutability === 'pure') continue;
        const sig = `${f.name}(${(f.inputs ?? []).map((i) => i.type).join(',')})`;
        candidates.push({ signature: sig, source: 'abi' });
      }
    }
  } catch {
    /* fall back to bytecode fingerprint */
  }

  // Bytecode fingerprint fallback / cross-check.
  for (const sig of MINT_SIGS) {
    if (codeHex.includes(toFunctionSelector(sig).slice(2).toLowerCase())) {
      if (!candidates.some((c) => c.signature === sig)) candidates.push({ signature: sig, source: 'bytecode' });
    }
  }
  base.candidates = candidates;

  // Price + supply best-effort.
  for (const fn of PRICE_FNS) {
    try {
      const wei = (await client.readContract({ address, abi: uintView(fn), functionName: fn })) as bigint;
      if (wei >= 0n) {
        base.priceWei = wei.toString();
        base.priceEth = Number(wei) / 1e18;
        break;
      }
    } catch {
      /* not this getter */
    }
  }
  const supply = await readFirst(address, ['totalSupply']);
  base.totalSupply = supply;
  base.maxSupply = await readFirst(address, SUPPLY_FNS.filter((s) => s !== 'totalSupply'));

  if (candidates.length === 0) base.note = 'No mint function detected. It may not be deployed yet, or use a nonstandard name — mint via the explorer if needed.';
  return base;
}

async function readFirst(address: Address, fns: string[]): Promise<number | null> {
  const client = getPublicClient();
  for (const fn of fns) {
    try {
      const v = (await client.readContract({ address, abi: uintView(fn), functionName: fn })) as bigint;
      return Number(v);
    } catch {
      /* try next */
    }
  }
  return null;
}

export interface MintResult {
  ok: boolean;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
}

/**
 * Execute a mint: call `signature` with `quantity`, sending `valueEth`. Simulates
 * first — a revert (wrong value/args, not live yet) costs nothing.
 */
export async function executeMint(params: {
  contract: string;
  signature: string;
  quantity: number;
  valueEth: string;
}): Promise<MintResult> {
  if (!buyerReady()) return { ok: false, error: 'Set PRIVATE_KEY and RPC_URL first.' };
  const wallet = getWalletClient();
  const to = getWalletAddress();
  if (!wallet || !to) return { ok: false, error: 'Wallet not available.' };

  if (!isAddress(params.contract.toLowerCase())) return { ok: false, error: 'Invalid contract address.' };
  const address = getAddress(params.contract.toLowerCase());
  const qty = BigInt(Math.max(1, Math.floor(params.quantity || 1)));
  let value: bigint;
  try {
    value = parseEther((params.valueEth || '0').trim());
  } catch {
    return { ok: false, error: 'Invalid ETH value.' };
  }

  // Build the ABI item + args from the chosen signature.
  let abiItem;
  try {
    abiItem = parseAbiItem(`function ${params.signature} payable`);
  } catch {
    return { ok: false, error: `Could not parse signature "${params.signature}".` };
  }
  const types = extractTypes(params.signature);
  const built = buildArgs(types, qty, to);
  if ('error' in built) return { ok: false, error: built.error };

  const call = {
    address,
    abi: [abiItem] as const,
    functionName: (abiItem as { name: string }).name,
    args: built.args as never,
    value,
    account: to,
  };

  try {
    const client = getPublicClient();
    await client.simulateContract(call as never); // reverts here spend nothing
    const hash = await wallet.writeContract(call as never);
    logger.info('mint.sent', { address, signature: params.signature, txHash: hash });
    return { ok: true, txHash: hash, explorerUrl: `${EXPLORER_TX}${hash}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Mint failed (nothing spent if pre-send): ${msg.slice(0, 240)}` };
  }
}

function extractTypes(signature: string): string[] {
  const m = signature.match(/\((.*)\)/);
  if (!m || !m[1]?.trim()) return [];
  return m[1].split(',').map((s) => s.trim());
}

function buildArgs(types: string[], qty: bigint, to: Address): { args: unknown[] } | { error: string } {
  if (types.length === 0) return { args: [] };
  if (types.length === 1 && types[0] === 'uint256') return { args: [qty] };
  if (types.length === 1 && types[0] === 'address') return { args: [to] };
  if (types.length === 2 && types[0] === 'address' && types[1] === 'uint256') return { args: [to, qty] };
  if (types.length === 2 && types[0] === 'uint256' && types[1] === 'address') return { args: [qty, to] };
  return { error: `Unsupported mint args (${types.join(',')}). Pick another function or mint via the explorer.` };
}
