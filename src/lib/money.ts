/**
 * Monetary conversion helpers.
 *
 * OpenSea returns order/consideration amounts as integer strings in the
 * smallest unit (wei) of the payment token. We convert to a JS number of whole
 * tokens (ETH/WETH) for analysis. NFT prices in the low thousands of ETH stay
 * well within IEEE-754 safe precision at 1e-6 granularity, which is more than
 * enough for spread analysis; we never use these numbers to sign transactions.
 */

const WEI_PER_ETH = 1e18;

/** Convert an integer wei string/bigint to a number of whole tokens. */
export function weiToEth(wei: string | bigint | number, decimals = 18): number {
  const asBig = typeof wei === 'bigint' ? wei : BigInt(Math.trunc(Number(wei)) || 0);
  if (decimals === 18 && typeof wei === 'string') {
    // Precise path for the common 18-decimal case using string math.
    return Number(BigInt(wei)) / WEI_PER_ETH;
  }
  const divisor = 10 ** decimals;
  return Number(asBig) / divisor;
}

/** Basis points (e.g. 250) as a fraction (0.025). */
export function bpsToFraction(bps: number): number {
  return bps / 10_000;
}

/** Format an ETH amount for display. */
export function formatEth(value: number | null | undefined, decimals = 4): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(decimals)}`;
}

/** Format a fraction as a percentage string. */
export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}
