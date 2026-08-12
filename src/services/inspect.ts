import 'server-only';
import { getAddress, isAddress, toFunctionSelector, type Address } from 'viem';
import { getPublicClient } from '@/lib/chain/wallet';
import { logger } from '@/lib/logger';

const BLOCKSCOUT = 'https://robinhoodchain.blockscout.com';

/** Function signatures we fingerprint in bytecode to classify a contract. */
const PROBES: { sig: string; label: string }[] = [
  { sig: 'name()', label: 'name' },
  { sig: 'symbol()', label: 'symbol' },
  { sig: 'decimals()', label: 'decimals' },
  { sig: 'totalSupply()', label: 'totalSupply' },
  { sig: 'transfer(address,uint256)', label: 'transfer' },
  { sig: 'token0()', label: 'token0' },
  { sig: 'token1()', label: 'token1' },
  { sig: 'getReserves()', label: 'getReserves' },
  { sig: 'sync()', label: 'sync' },
  { sig: 'swap(uint256,uint256,address,bytes)', label: 'swap(pair)' },
  { sig: 'getAmountsOut(uint256,address[])', label: 'getAmountsOut' },
  { sig: 'getAmountOut(uint256,address,address)', label: 'getAmountOut(solidly)' },
  { sig: 'swapExactETHForTokens(uint256,address[],address,uint256)', label: 'swapExactETHForTokens' },
  { sig: 'swapExactTokensForETH(uint256,uint256,address[],address,uint256)', label: 'swapExactTokensForETH' },
  { sig: 'swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)', label: 'swapExactETHForTokensFOT' },
  { sig: 'WETH()', label: 'WETH()' },
  { sig: 'factory()', label: 'factory()' },
  { sig: 'createPair(address,address)', label: 'createPair' },
  { sig: 'getPair(address,address)', label: 'getPair' },
  { sig: 'addLiquidityETH(address,uint256,uint256,uint256,address,uint256)', label: 'addLiquidityETH' },
  { sig: 'deposit()', label: 'deposit()' },
  { sig: 'buy()', label: 'buy()' },
  { sig: 'buy(uint256)', label: 'buy(uint256)' },
  { sig: 'mint(address)', label: 'mint(address)' },
];
const SELECTORS = PROBES.map((p) => ({ label: p.label, sel: toFunctionSelector(p.sig).slice(2).toLowerCase() }));

const ADDR_VIEW = (name: string) =>
  [{ type: 'function', name, stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }] as const;

export interface InspectResult {
  address: string;
  isContract: boolean;
  verified: boolean;
  verifiedName: string | null;
  classification: string;
  /** Function names from the verified ABI (when available). */
  abiFunctions: string[];
  /** Function labels fingerprinted from bytecode (fallback / cross-check). */
  detected: string[];
  extra: Record<string, string>;
  note?: string;
}

export async function inspectContracts(addresses: string[]): Promise<InspectResult[]> {
  const uniq = [...new Set(addresses.map((a) => a.trim().toLowerCase()).filter((a) => isAddress(a)))].slice(0, 12);
  return Promise.all(uniq.map(inspectOne));
}

async function inspectOne(addrLower: string): Promise<InspectResult> {
  const address = getAddress(addrLower);
  const client = getPublicClient();

  let code = '0x';
  try {
    code = (await client.request({ method: 'eth_getCode', params: [address, 'latest'] })) as string;
  } catch (err) {
    logger.warn('inspect.getcode_failed', { address, error: String(err) });
    return blank(address, false, 'RPC unreachable', 'Set RPC_URL — could not read bytecode.');
  }
  const isContract = Boolean(code) && code !== '0x';
  if (!isContract) {
    return blank(address, false, 'EOA / not a contract', 'No bytecode — an externally owned account (wallet) or not deployed.');
  }

  const codeHex = code.toLowerCase();
  const detected = SELECTORS.filter((s) => codeHex.includes(s.sel)).map((s) => s.label);

  // Verified ABI from Blockscout (best signal when present).
  let verified = false;
  let verifiedName: string | null = null;
  let abiFunctions: string[] = [];
  try {
    const res = await fetch(`${BLOCKSCOUT}/api/v2/smart-contracts/${address}`);
    if (res.ok) {
      const body = (await res.json()) as { name?: string; is_verified?: boolean; abi?: Array<{ type?: string; name?: string }> };
      verified = Boolean(body.is_verified);
      verifiedName = body.name ?? null;
      if (Array.isArray(body.abi)) {
        abiFunctions = body.abi.filter((x) => x.type === 'function' && x.name).map((x) => x.name as string);
      }
    }
  } catch {
    /* Blockscout unreachable — rely on bytecode fingerprint */
  }

  // Concrete reads to pin down identity + the pool's token pair.
  const extra: Record<string, string> = {};
  const looksPool = detected.includes('token0') && detected.includes('token1');
  if (looksPool) {
    try {
      const [t0, t1] = await Promise.all([
        client.readContract({ address, abi: ADDR_VIEW('token0'), functionName: 'token0' }),
        client.readContract({ address, abi: ADDR_VIEW('token1'), functionName: 'token1' }),
      ]);
      extra.token0 = String(t0);
      extra.token1 = String(t1);
    } catch {
      /* ignore */
    }
  }
  for (const fn of ['factory', 'WETH'] as const) {
    if (detected.includes(`${fn}()`)) {
      try {
        extra[fn] = String(await client.readContract({ address, abi: ADDR_VIEW(fn), functionName: fn }));
      } catch {
        /* ignore */
      }
    }
  }

  const hasSwap = detected.some((d) => d.startsWith('swapExactETHForTokens') || d === 'getAmountsOut' || d === 'getAmountOut(solidly)');
  const looksToken = detected.includes('symbol') && detected.includes('decimals') && detected.includes('transfer') && !looksPool;

  let classification = 'Custom / unknown contract';
  if (looksPool) classification = 'Liquidity pool (AMM pair)';
  else if (hasSwap) classification = 'Router (swap entry point)';
  else if (detected.includes('createPair') || detected.includes('getPair')) classification = 'Factory (creates pools)';
  else if (looksToken) classification = 'ERC-20 token';

  return {
    address,
    isContract: true,
    verified,
    verifiedName,
    classification,
    abiFunctions,
    detected,
    extra,
    note: verified ? undefined : 'Unverified on Blockscout — functions fingerprinted from bytecode (may be incomplete).',
  };
}

function blank(address: Address, isContract: boolean, classification: string, note: string): InspectResult {
  return { address, isContract, verified: false, verifiedName: null, classification, abiFunctions: [], detected: [], extra: {}, note };
}
