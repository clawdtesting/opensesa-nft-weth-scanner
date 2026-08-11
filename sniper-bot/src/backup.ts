import { config } from './config.js';
import { log } from './logger.js';

/**
 * Backup discovery via Dexscreener. Returns true if Dexscreener already lists a
 * pair for the token that has some liquidity — a signal the pool is live even if
 * we somehow missed the on-chain event.
 *
 * Dexscreener's token endpoint is chain-agnostic; if Robinhood Chain isn't
 * indexed there yet this simply returns false (no harm, events remain primary).
 */
export async function dexscreenerHasPair(token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`);
    if (!res.ok) return false;
    const body = (await res.json()) as { pairs?: Array<{ chainId?: string; liquidity?: { usd?: number } }> };
    const pairs = body.pairs ?? [];
    const relevant = config.dexscreenerChain
      ? pairs.filter((p) => (p.chainId ?? '').toLowerCase() === config.dexscreenerChain!.toLowerCase())
      : pairs;
    return relevant.some((p) => (p.liquidity?.usd ?? 0) > 0);
  } catch (err) {
    log.warn('Dexscreener poll failed', String(err));
    return false;
  }
}
