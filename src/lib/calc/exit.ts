import type { RealisticExit, VelocityMetrics, FloorBook } from '@/domain/types';
import type { ExitModelWeights } from '@/config/strategy';
import { clamp } from '@/lib/math';

export interface ExitInputs {
  velocity: VelocityMetrics;
  floorBook: FloorBook;
  /** Median of the most recent N sales (defaults to medianSale24h if absent). */
  medianRecentSales?: number | null;
  /** Short-term trend in [-1, 1]. */
  trend: number;
}

/**
 * RealisticExitPrice model.
 *
 * We explicitly do NOT assume `exit = floor`. Instead we blend several observable
 * anchors, each of which captures a different failure mode of using floor alone:
 *
 *   - median recent sales      → what buyers actually paid (not just asked)
 *   - current floor            → the cheapest way a competitor can undercut us
 *   - median of cheapest 5 asks→ realistic short-term liquidation level
 *   - short-term trend         → nudge up/down for momentum
 *
 * The output is fully explainable: every input, weight, and the resulting number
 * are returned so the dashboard can show *why* the exit price is what it is.
 */
export function computeRealisticExit(
  inputs: ExitInputs,
  weights: ExitModelWeights,
): RealisticExit {
  const medianRecentSales =
    inputs.medianRecentSales ?? inputs.velocity.medianSale24h ?? null;
  const currentFloor = inputs.floorBook.floor;
  const medianCheapestListings = inputs.floorBook.medianCheapest5;
  const trend = clamp(inputs.trend, -1, 1);

  // Collect the available anchors with their configured weights; renormalise so
  // missing inputs don't silently deflate the estimate.
  const anchors: Array<{ value: number; weight: number }> = [];
  if (medianRecentSales !== null) anchors.push({ value: medianRecentSales, weight: weights.medianRecentSales });
  if (currentFloor !== null) anchors.push({ value: currentFloor, weight: weights.currentFloor });
  if (medianCheapestListings !== null)
    anchors.push({ value: medianCheapestListings, weight: weights.medianCheapestListings });

  const baseInputs = {
    medianRecentSales,
    currentFloor,
    medianCheapestListings,
    shortTermTrend: trend,
  };

  if (anchors.length === 0) {
    return {
      price: null,
      confidence: 0,
      inputs: baseInputs,
      weights,
      explanation: 'No sales or listings available to anchor a realistic exit price.',
    };
  }

  const totalWeight = anchors.reduce((s, a) => s + a.weight, 0);
  const weightedBase = anchors.reduce((s, a) => s + a.value * a.weight, 0) / totalWeight;

  // Apply the trend as a bounded multiplicative nudge (max ±[trendWeight] effect).
  const trendAdj = 1 + trend * weights.shortTermTrend;
  const price = weightedBase * trendAdj;

  // Confidence grows with data richness: more anchors, more sales, more listings.
  const anchorFactor = anchors.length / 3; // 0.33 .. 1
  const salesFactor = clamp(inputs.velocity.sales24h / 20, 0, 1);
  const listingFactor = clamp(inputs.floorBook.floorDepth5 / 5, 0, 1);
  const confidence = clamp(0.4 * anchorFactor + 0.4 * salesFactor + 0.2 * listingFactor, 0, 1);

  const parts: string[] = [];
  if (medianRecentSales !== null)
    parts.push(`${(weights.medianRecentSales * 100).toFixed(0)}% median recent sales (${medianRecentSales.toFixed(4)})`);
  if (currentFloor !== null)
    parts.push(`${(weights.currentFloor * 100).toFixed(0)}% floor (${currentFloor.toFixed(4)})`);
  if (medianCheapestListings !== null)
    parts.push(`${(weights.medianCheapestListings * 100).toFixed(0)}% median cheapest asks (${medianCheapestListings.toFixed(4)})`);
  const trendTxt = trend === 0 ? 'flat' : `${trend > 0 ? '+' : ''}${(trend * 100).toFixed(1)}%`;

  return {
    price,
    confidence,
    inputs: baseInputs,
    weights,
    explanation: `Blend of ${parts.join(', ')}; short-term trend ${trendTxt} applied.`,
  };
}
