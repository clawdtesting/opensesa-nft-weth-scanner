import { describe, it, expect } from 'vitest';
import { computeProbabilities } from '@/lib/calc/probability';
import { computeCapitalEfficiency } from '@/lib/calc/capitalEfficiency';
import type { VelocityMetrics, BidBook, FloorBook, AcceptedOfferStats } from '@/domain/types';

const velocity = (o: Partial<VelocityMetrics> = {}): VelocityMetrics => ({
  sales1h: 2,
  sales6h: 8,
  sales24h: 30,
  sales7d: 200,
  volume1h: 2,
  volume6h: 8,
  volume24h: 30,
  volume7d: 200,
  uniqueBuyers24h: 15,
  uniqueSellers24h: 15,
  medianSale1h: 1,
  medianSale6h: 1,
  medianSale24h: 1,
  meanSale24h: 1,
  lastSalePrice: 1,
  lastSaleTimestamp: new Date(),
  ...o,
});

const bidBook = (o: Partial<BidBook> = {}): BidBook => ({
  bestBid: 0.72,
  secondBid: 0.6,
  thirdBid: 0.5,
  offerCount: 3,
  distanceBestToSecond: 0.12,
  bidDepth1: 1,
  bidDepth2: 1,
  bidDepth5: 2,
  bidDepth10: 3,
  ...o,
});

const floorBook = (o: Partial<FloorBook> = {}): FloorBook => ({
  floor: 1,
  listingCount: 6,
  floorDepth1: 2,
  floorDepth2: 3,
  floorDepth5: 5,
  floorDepth10: 6,
  floorWallRatio: 0.2,
  medianCheapest5: 1.02,
  ...o,
});

const accepted = (o: Partial<AcceptedOfferStats> = {}): AcceptedOfferStats => ({
  acceptedOffers1h: 1,
  acceptedOffers6h: 4,
  acceptedOffers24h: 10,
  acceptedOffers7d: 40,
  medianAcceptedPrice: 0.8,
  meanAcceptedPrice: 0.8,
  medianSellerConcession: 0.2,
  concessionP25: 0.15,
  concessionP75: 0.25,
  ...o,
});

describe('computeProbabilities', () => {
  it('produces bounded probabilities in (0,1)', () => {
    const p = computeProbabilities({
      velocity: velocity(),
      bidBook: bidBook(),
      floorBook: floorBook(),
      accepted: accepted(),
      recommendedBid: 0.725,
      realisticExit: 0.94,
      trend: 0.1,
    });
    expect(p.fillProbability).toBeGreaterThan(0);
    expect(p.fillProbability).toBeLessThanOrEqual(1);
    expect(p.exitProbability72h).toBeGreaterThanOrEqual(p.exitProbability24h);
  });

  it('liquid markets exit faster than illiquid ones', () => {
    const liquid = computeProbabilities({
      velocity: velocity({ sales24h: 60 }),
      bidBook: bidBook(),
      floorBook: floorBook(),
      accepted: accepted(),
      recommendedBid: 0.7,
      realisticExit: 0.9,
      trend: 0,
    });
    const illiquid = computeProbabilities({
      velocity: velocity({ sales24h: 3 }),
      bidBook: bidBook(),
      floorBook: floorBook(),
      accepted: accepted({ acceptedOffers24h: 1 }),
      recommendedBid: 0.7,
      realisticExit: 0.9,
      trend: 0,
    });
    expect(liquid.exitProbability24h).toBeGreaterThan(illiquid.exitProbability24h);
    expect(liquid.estimatedHoldingHours).toBeLessThan(illiquid.estimatedHoldingHours);
  });

  it('strong accepted-offer activity raises fill probability', () => {
    const high = computeProbabilities({
      velocity: velocity(),
      bidBook: bidBook(),
      floorBook: floorBook(),
      accepted: accepted({ acceptedOffers24h: 12 }),
      recommendedBid: 0.73,
      realisticExit: 0.9,
      trend: 0,
    });
    const low = computeProbabilities({
      velocity: velocity(),
      bidBook: bidBook(),
      floorBook: floorBook(),
      accepted: accepted({ acceptedOffers24h: 0 }),
      recommendedBid: 0.73,
      realisticExit: 0.9,
      trend: 0,
    });
    expect(high.fillProbability).toBeGreaterThan(low.fillProbability);
  });
});

describe('computeCapitalEfficiency', () => {
  it('is higher for more profit, higher probability and shorter holding', () => {
    const good = computeCapitalEfficiency({
      expectedProfit: 0.2,
      fillProbability: 0.6,
      exitProbability: 0.7,
      capitalRequired: 0.7,
      expectedHoldingHours: 10,
    })!;
    const worse = computeCapitalEfficiency({
      expectedProfit: 0.2,
      fillProbability: 0.6,
      exitProbability: 0.7,
      capitalRequired: 0.7,
      expectedHoldingHours: 100,
    })!;
    expect(good).toBeGreaterThan(worse);
  });

  it('returns null without capital or profit', () => {
    expect(
      computeCapitalEfficiency({
        expectedProfit: null,
        fillProbability: 0.5,
        exitProbability: 0.5,
        capitalRequired: 1,
        expectedHoldingHours: 10,
      }),
    ).toBeNull();
  });
});
