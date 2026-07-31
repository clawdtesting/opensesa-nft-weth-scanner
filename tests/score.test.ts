import { describe, it, expect } from 'vitest';
import { computeOpportunityScore, type ScoreInputs } from '@/lib/calc/score';
import { DEFAULT_STRATEGY } from '@/config/strategy';
import type { VelocityMetrics, BidBook, FloorBook, AcceptedOfferStats, SpreadResult, Probabilities } from '@/domain/types';

function baseInputs(): ScoreInputs {
  const velocity: VelocityMetrics = {
    sales1h: 2, sales6h: 8, sales24h: 30, sales7d: 200,
    volume1h: 2, volume6h: 8, volume24h: 30, volume7d: 200,
    uniqueBuyers24h: 15, uniqueSellers24h: 15,
    medianSale1h: 1, medianSale6h: 1, medianSale24h: 1, meanSale24h: 1,
    lastSalePrice: 1, lastSaleTimestamp: new Date(),
  };
  const bidBook: BidBook = {
    bestBid: 0.72, secondBid: 0.6, thirdBid: 0.5, offerCount: 4,
    distanceBestToSecond: 0.12, bidDepth1: 1, bidDepth2: 2, bidDepth5: 3, bidDepth10: 4,
  };
  const floorBook: FloorBook = {
    floor: 1, listingCount: 6, floorDepth1: 2, floorDepth2: 3, floorDepth5: 4, floorDepth10: 6,
    floorWallRatio: 0.2, medianCheapest5: 1.02,
  };
  const accepted: AcceptedOfferStats = {
    acceptedOffers1h: 1, acceptedOffers6h: 4, acceptedOffers24h: 10, acceptedOffers7d: 40,
    medianAcceptedPrice: 0.8, meanAcceptedPrice: 0.8, medianSellerConcession: 0.2,
    concessionP25: 0.15, concessionP75: 0.25,
  };
  const spread: SpreadResult = {
    rawSpread: 0.28, realisticSpread: 0.3, marketplaceFee: 0.02, creatorFee: 0.005,
    gas: 0.0015, riskBuffer: 0.02, expectedNetProfit: 0.15, expectedRoi: 0.2,
  };
  const probabilities: Probabilities = {
    fillProbability: 0.6, exitProbability24h: 0.6, exitProbability72h: 0.85, estimatedHoldingHours: 12,
  };
  return { velocity, bidBook, floorBook, accepted, spread, probabilities, capitalEfficiency: 0.001, floorChange6h: 0, trend: 0.05 };
}

describe('computeOpportunityScore', () => {
  it('scores a healthy market highly and exposes components + reason', () => {
    const r = computeOpportunityScore(baseInputs(), DEFAULT_STRATEGY);
    expect(r.score).toBeGreaterThan(60);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(Object.keys(r.weightedComponents)).toContain('liquidity');
    expect(r.reason).toContain('sales in 24h');
  });

  it('penalises a dead market with no recent sales', () => {
    const inputs = baseInputs();
    inputs.velocity.sales6h = 0;
    inputs.velocity.sales24h = 2;
    const r = computeOpportunityScore(inputs, DEFAULT_STRATEGY);
    const reasons = r.riskPenalties.map((p) => p.reason).join(' ');
    expect(reasons).toContain('No sales in the last 6h');
    expect(reasons).toContain('Very low transaction count');
  });

  it('penalises a rapidly falling floor', () => {
    const inputs = baseInputs();
    inputs.floorChange6h = -0.25;
    const r = computeOpportunityScore(inputs, DEFAULT_STRATEGY);
    expect(r.riskPenalties.some((p) => p.reason.includes('Floor falling fast'))).toBe(true);
  });

  it('penalises single-sale volume distortion (mean much greater than median)', () => {
    const inputs = baseInputs();
    inputs.velocity.meanSale24h = 10;
    inputs.velocity.medianSale24h = 1;
    const r = computeOpportunityScore(inputs, DEFAULT_STRATEGY);
    expect(r.riskPenalties.some((p) => p.reason.includes('single-sale volume distortion'))).toBe(true);
  });

  it('clamps the score between 0 and 100', () => {
    const inputs = baseInputs();
    inputs.velocity.sales6h = 0;
    inputs.velocity.sales24h = 1;
    inputs.floorChange6h = -0.9;
    inputs.spread.expectedRoi = 0;
    inputs.probabilities.fillProbability = 0.01;
    inputs.probabilities.exitProbability24h = 0.01;
    const r = computeOpportunityScore(inputs, DEFAULT_STRATEGY);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
