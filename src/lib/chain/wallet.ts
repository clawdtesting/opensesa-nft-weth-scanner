import 'server-only';
import { createPublicClient, http, formatEther, formatUnits, getAddress, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { robinhoodChain } from './robinhood';
import { env } from '@/config/env';

/** Minimal ERC-20 read ABI (balanceOf / decimals / symbol). */
export const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const;

/** A read-only viem client bound to the Robinhood chain. */
export function getPublicClient() {
  return createPublicClient({ chain: robinhoodChain, transport: http() });
}

/**
 * The configured wallet's address, derived from PRIVATE_KEY. Returns null when
 * no (valid) key is set. NEVER returns or logs the key itself.
 */
export function getWalletAddress(): `0x${string}` | null {
  const pk = env.buyer.privateKey;
  if (!pk) return null;
  try {
    const key = (pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`;
    return privateKeyToAccount(key).address;
  } catch {
    return null;
  }
}

/** Native ETH balance (whole ETH) for an address. */
export async function getEthBalance(address: `0x${string}`): Promise<number> {
  const wei = await getPublicClient().getBalance({ address });
  return Number(formatEther(wei));
}

/** ERC-20 token balance (whole tokens) for an address; null on any failure. */
export async function getTokenBalance(
  token: string,
  owner: `0x${string}`,
): Promise<number | null> {
  const norm = token.toLowerCase();
  if (!isAddress(norm)) return null;
  try {
    const client = getPublicClient();
    const address = getAddress(norm);
    const [raw, decimals] = await Promise.all([
      client.readContract({ address, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] }),
      client.readContract({ address, abi: ERC20_ABI, functionName: 'decimals' }),
    ]);
    return Number(formatUnits(raw as bigint, Number(decimals)));
  } catch {
    return null;
  }
}

/** ERC-20 symbol + decimals; nulls on failure. */
export async function getTokenMeta(
  token: string,
): Promise<{ symbol: string | null; decimals: number | null }> {
  const norm = token.toLowerCase();
  if (!isAddress(norm)) return { symbol: null, decimals: null };
  try {
    const client = getPublicClient();
    const address = getAddress(norm);
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: ERC20_ABI, functionName: 'symbol' }),
      client.readContract({ address, abi: ERC20_ABI, functionName: 'decimals' }),
    ]);
    return { symbol: String(symbol), decimals: Number(decimals) };
  } catch {
    return { symbol: null, decimals: null };
  }
}
