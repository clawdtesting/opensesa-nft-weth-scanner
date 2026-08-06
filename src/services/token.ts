import 'server-only';
import { isAddress } from 'viem';
import { getWalletAddress, getTokenBalance, getTokenMeta } from '@/lib/chain/wallet';

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
  if (!isAddress(address)) {
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
  if (!isAddress(address)) {
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
