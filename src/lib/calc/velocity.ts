import type { SaleRecord, VelocityMetrics } from '@/domain/types';
import { median, mean, distinctCount } from '@/lib/math';

const HOUR = 3_600_000;

/**
 * Compute sales-velocity metrics from a list of sales.
 *
 * Transaction *count* is treated as first-class alongside volume: a collection
 * doing 40 ETH across 2 sales is not the same market as 25 ETH across 50 sales,
 * and callers rely on these counts (not just volume) when ranking.
 */
export function computeVelocity(sales: readonly SaleRecord[], now: Date = new Date()): VelocityMetrics {
  const t = now.getTime();
  const within = (ms: number) => sales.filter((s) => t - s.timestamp.getTime() <= ms);

  const s1h = within(HOUR);
  const s6h = within(6 * HOUR);
  const s24h = within(24 * HOUR);
  const s7d = within(7 * 24 * HOUR);

  const vol = (arr: readonly SaleRecord[]) => arr.reduce((sum, s) => sum + s.priceEth, 0);
  const prices = (arr: readonly SaleRecord[]) => arr.map((s) => s.priceEth);

  const sortedDesc = [...sales].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const last = sortedDesc[0];

  return {
    sales1h: s1h.length,
    sales6h: s6h.length,
    sales24h: s24h.length,
    sales7d: s7d.length,
    volume1h: vol(s1h),
    volume6h: vol(s6h),
    volume24h: vol(s24h),
    volume7d: vol(s7d),
    uniqueBuyers24h: distinctCount(s24h.map((s) => s.buyer)),
    uniqueSellers24h: distinctCount(s24h.map((s) => s.seller)),
    medianSale1h: median(prices(s1h)),
    medianSale6h: median(prices(s6h)),
    medianSale24h: median(prices(s24h)),
    meanSale24h: mean(prices(s24h)),
    lastSalePrice: last ? last.priceEth : null,
    lastSaleTimestamp: last ? last.timestamp : null,
  };
}

/**
 * Short-term price trend in [-1, 1]: compares median sale price in the most
 * recent 6h against the prior 6h→24h window. Positive => rising market.
 */
export function shortTermTrend(sales: readonly SaleRecord[], now: Date = new Date()): number {
  const t = now.getTime();
  const recent = sales.filter((s) => t - s.timestamp.getTime() <= 6 * HOUR);
  const prior = sales.filter((s) => {
    const age = t - s.timestamp.getTime();
    return age > 6 * HOUR && age <= 24 * HOUR;
  });
  const mRecent = median(recent.map((s) => s.priceEth));
  const mPrior = median(prior.map((s) => s.priceEth));
  if (mRecent === null || mPrior === null || mPrior === 0) return 0;
  const change = (mRecent - mPrior) / mPrior;
  // Clamp to a sane band; a single outlier shouldn't swing the model wildly.
  return Math.max(-1, Math.min(1, change));
}
