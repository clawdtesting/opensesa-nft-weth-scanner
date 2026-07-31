import { describe, it, expect } from 'vitest';
import { computeSpread } from '@/lib/calc/spread';
import { DEFAULT_STRATEGY } from '@/config/strategy';

describe('computeSpread', () => {
  it('computes raw and realistic spreads', () => {
    const r = computeSpread(
      {
        floor: 1.0,
        bestBid: 0.72,
        realisticExit: 0.94,
        recommendedBid: 0.725,
        marketplaceFeeBps: 250,
        creatorFeeBps: 50,
      },
      DEFAULT_STRATEGY.fees,
    );
    expect(r.rawSpread).toBeCloseTo(0.28, 5);
    expect(r.realisticSpread).toBeCloseTo((0.94 - 0.725) / 0.725, 5);
  });

  it('subtracts marketplace, creator, gas and risk buffer from net profit', () => {
    const r = computeSpread(
      {
        floor: 1.0,
        bestBid: 0.72,
        realisticExit: 1.0,
        recommendedBid: 0.8,
        marketplaceFeeBps: 250,
        creatorFeeBps: 250,
      },
      DEFAULT_STRATEGY.fees,
    );
    // fees = 2.5% + 2.5% of exit(1.0) = 0.05; gas 0.0015; risk 2% of 1.0 = 0.02
    const expectedNet = 1.0 - 0.8 - 0.025 - 0.025 - 0.0015 - 0.02;
    expect(r.marketplaceFee).toBeCloseTo(0.025, 6);
    expect(r.creatorFee).toBeCloseTo(0.025, 6);
    expect(r.riskBuffer).toBeCloseTo(0.02, 6);
    expect(r.expectedNetProfit).toBeCloseTo(expectedNet, 6);
    expect(r.expectedRoi).toBeCloseTo(expectedNet / 0.8, 6);
  });

  it('a huge raw spread on a dead market can still be unprofitable after costs', () => {
    // Floor 2.0, best bid 0.3 => raw spread 85%, but realistic exit is low.
    const r = computeSpread(
      {
        floor: 2.0,
        bestBid: 0.3,
        realisticExit: 0.32,
        recommendedBid: 0.305,
        marketplaceFeeBps: 250,
        creatorFeeBps: 500,
      },
      DEFAULT_STRATEGY.fees,
    );
    expect(r.rawSpread!).toBeGreaterThan(0.8);
    expect(r.expectedRoi!).toBeLessThan(0.1); // the headline spread is a mirage
  });

  it('returns nulls when inputs are missing', () => {
    const r = computeSpread(
      { floor: null, bestBid: null, realisticExit: null, recommendedBid: null, marketplaceFeeBps: 250, creatorFeeBps: 0 },
      DEFAULT_STRATEGY.fees,
    );
    expect(r.rawSpread).toBeNull();
    expect(r.expectedNetProfit).toBeNull();
  });
});
