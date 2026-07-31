import type {
  Probabilities,
  VelocityMetrics,
  BidBook,
  FloorBook,
  AcceptedOfferStats,
} from '@/domain/types';
import { clamp } from '@/lib/math';

export interface ProbabilityInputs {
  velocity: VelocityMetrics;
  bidBook: BidBook;
  floorBook: FloorBook;
  accepted: AcceptedOfferStats;
  recommendedBid: number | null;
  realisticExit: number | null;
  /** Short-term trend in [-1, 1]. */
  trend: number;
}

/**
 * Transparent, heuristic probability model. Every term is a bounded, explainable
 * contribution — we deliberately avoid an opaque fitted model in V1 so the
 * numbers can be reasoned about and later validated against the backtester.
 */
export function computeProbabilities(inputs: ProbabilityInputs): Probabilities {
  const { velocity, bidBook, floorBook, accepted } = inputs;

  // ---- Fill probability -------------------------------------------------
  // How likely is a seller to accept our WETH bid soon?
  //  + sellers are demonstrably accepting below-floor offers (accepted24h)
  //  + there are sellers active at all (uniqueSellers24h)
  //  + our bid is competitive vs the existing best bid
  //  - the more competing bids sit right at the top, the more we may get sniped
  const acceptanceBase = clamp(accepted.acceptedOffers24h / 12, 0, 1); // saturates at ~12/day
  const sellerActivity = clamp(velocity.uniqueSellers24h / 15, 0, 1);

  let competitiveness = 0.5;
  if (inputs.recommendedBid !== null && bidBook.bestBid !== null && bidBook.bestBid > 0) {
    // recommendedBid at/above best bid => competitive (>=0.5).
    const ratio = inputs.recommendedBid / bidBook.bestBid;
    competitiveness = clamp(0.5 + (ratio - 1) * 5, 0, 1);
  } else if (inputs.recommendedBid !== null && bidBook.bestBid === null) {
    competitiveness = 0.7; // no competition at all
  }

  // Crowded top-of-book reduces the chance our specific bid is the one hit.
  const crowdPenalty = clamp((bidBook.bidDepth1 - 1) * 0.05, 0, 0.3);

  const fillProbability = clamp(
    0.45 * acceptanceBase + 0.2 * sellerActivity + 0.35 * competitiveness - crowdPenalty,
    0.01,
    0.98,
  );

  // ---- Exit probability -------------------------------------------------
  // How likely can we resell near the realistic exit within a horizon?
  //  + high sales velocity => buyers are clearing inventory
  //  + broad unique-buyer base => durable demand
  //  - a thick floor wall means we queue behind many sellers
  //  ± market trend nudges both ways
  const velocityFactor = clamp(velocity.sales24h / 30, 0, 1);
  const buyerFactor = clamp(velocity.uniqueBuyers24h / 15, 0, 1);
  const wallPenalty = clamp((floorBook.floorWallRatio ?? 0) / 10, 0, 0.4);
  const trendAdj = inputs.trend * 0.1;

  const exitBase = clamp(
    0.55 * velocityFactor + 0.35 * buyerFactor - wallPenalty + trendAdj,
    0.01,
    0.98,
  );

  // 24h is the base window; 72h is higher (more time to clear) but saturating.
  const exitProbability24h = exitBase;
  const exitProbability72h = clamp(1 - (1 - exitBase) ** 2.2, 0.02, 0.99);

  // ---- Holding time -----------------------------------------------------
  // Expected hours to sell ≈ inverse of hourly sale rate, floored/capped sanely.
  const salesPerHour = velocity.sales24h / 24;
  const estimatedHoldingHours =
    salesPerHour > 0 ? clamp(24 / Math.max(salesPerHour, 0.05), 1, 336) : 336;

  return {
    fillProbability,
    exitProbability24h,
    exitProbability72h,
    estimatedHoldingHours,
  };
}
