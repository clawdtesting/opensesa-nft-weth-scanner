import type { SaleRecord, ListingRecord, OfferRecord } from '@/domain/types';
import type { StrategyConfig } from '@/config/strategy';
import { computeVelocity, shortTermTrend } from '@/lib/calc/velocity';
import { analyzeBidBook } from '@/lib/calc/bidbook';
import { analyzeFloorBook } from '@/lib/calc/floorbook';
import { computeAcceptedOfferStats } from '@/lib/calc/acceptedOffers';
import { computeRealisticExit } from '@/lib/calc/exit';
import { computeRecommendedBid } from '@/lib/calc/bid';
import { computeSpread } from '@/lib/calc/spread';
import { computeProbabilities } from '@/lib/calc/probability';
import { computeCapitalEfficiency } from '@/lib/calc/capitalEfficiency';
import { computeOpportunityScore } from '@/lib/calc/score';
import type {
  VelocityMetrics,
  BidBook,
  FloorBook,
  AcceptedOfferStats,
  RealisticExit,
  RecommendedBid,
  SpreadResult,
  Probabilities,
  OpportunityScore,
} from '@/domain/types';

export interface AnalysisInput {
  sales: readonly SaleRecord[];
  listings: readonly ListingRecord[];
  offers: readonly OfferRecord[];
  marketplaceFeeBps: number;
  creatorFeeBps: number;
  /** Floor 6h ago, when known, to compute floor drift and its risk penalty. */
  floor6hAgo?: number | null;
  now?: Date;
}

export interface Analysis {
  velocity: VelocityMetrics;
  bidBook: BidBook;
  floorBook: FloorBook;
  accepted: AcceptedOfferStats;
  trend: number;
  realisticExit: RealisticExit;
  recommendedBid: RecommendedBid;
  spread: SpreadResult;
  probabilities: Probabilities;
  capitalEfficiency: number | null;
  floorChange6h: number | null;
  opportunity: OpportunityScore;
}

/**
 * Full pipeline: raw market data → ranked opportunity. Pure and deterministic
 * given its inputs, so it is exercised directly by the test-suite fixtures and
 * reused by both the live snapshot service and the backtester.
 */
export function analyzeCollection(input: AnalysisInput, cfg: StrategyConfig): Analysis {
  const now = input.now ?? new Date();

  const velocity = computeVelocity(input.sales, now);
  const trend = shortTermTrend(input.sales, now);
  const bidBook = analyzeBidBook(input.offers, { now, onlyCollection: true });
  const floorBook = analyzeFloorBook(input.listings, velocity.sales24h, { now });
  const accepted = computeAcceptedOfferStats(input.sales, now);

  const realisticExit = computeRealisticExit(
    { velocity, floorBook, trend },
    cfg.exitWeights,
  );

  const recommendedBid = computeRecommendedBid(
    {
      bidBook,
      realisticExit: realisticExit.price,
      medianSellerConcession: accepted.medianSellerConcession,
    },
    cfg.bid,
  );

  const spread = computeSpread(
    {
      floor: floorBook.floor,
      bestBid: bidBook.bestBid,
      realisticExit: realisticExit.price,
      recommendedBid: recommendedBid.bid,
      marketplaceFeeBps: input.marketplaceFeeBps,
      creatorFeeBps: input.creatorFeeBps,
    },
    cfg.fees,
  );

  const probabilities = computeProbabilities({
    velocity,
    bidBook,
    floorBook,
    accepted,
    recommendedBid: recommendedBid.bid,
    realisticExit: realisticExit.price,
    trend,
  });

  const capitalEfficiency = computeCapitalEfficiency({
    expectedProfit: spread.expectedNetProfit,
    fillProbability: probabilities.fillProbability,
    exitProbability: probabilities.exitProbability24h,
    capitalRequired: recommendedBid.bid,
    expectedHoldingHours: probabilities.estimatedHoldingHours,
  });

  const floorChange6h =
    input.floor6hAgo && input.floor6hAgo > 0 && floorBook.floor !== null
      ? (floorBook.floor - input.floor6hAgo) / input.floor6hAgo
      : null;

  const opportunity = computeOpportunityScore(
    {
      velocity,
      bidBook,
      floorBook,
      accepted,
      spread,
      probabilities,
      capitalEfficiency,
      floorChange6h,
      trend,
    },
    cfg,
  );

  return {
    velocity,
    bidBook,
    floorBook,
    accepted,
    trend,
    realisticExit,
    recommendedBid,
    spread,
    probabilities,
    capitalEfficiency,
    floorChange6h,
    opportunity,
  };
}

/** Does an analysis pass the strategy's minimum filters? */
export function passesFilters(a: Analysis, cfg: StrategyConfig): boolean {
  const f = cfg.filters;
  if (a.velocity.sales24h < f.minSales24h) return false;
  if (a.velocity.volume24h < f.minVolume24hEth) return false;
  if (a.accepted.acceptedOffers24h < f.minAcceptedOffers24h) return false;
  if ((a.spread.rawSpread ?? 0) < f.minRawSpread) return false;
  if ((a.spread.expectedRoi ?? -Infinity) < f.minExpectedRoi) return false;
  if (a.floorChange6h !== null && a.floorChange6h < -f.maxFloorDrop6h) return false;
  if (a.opportunity.score < f.minOpportunityScore) return false;
  return true;
}
