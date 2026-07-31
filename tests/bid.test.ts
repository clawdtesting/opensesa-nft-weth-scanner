import { describe, it, expect } from 'vitest';
import { computeRecommendedBid } from '@/lib/calc/bid';
import { DEFAULT_STRATEGY } from '@/config/strategy';
import type { BidBook } from '@/domain/types';

function book(overrides: Partial<BidBook> = {}): BidBook {
  return {
    bestBid: 0.72,
    secondBid: 0.61,
    thirdBid: 0.5,
    offerCount: 3,
    distanceBestToSecond: 0.11,
    bidDepth1: 1,
    bidDepth2: 1,
    bidDepth5: 1,
    bidDepth10: 2,
    ...overrides,
  };
}

describe('computeRecommendedBid', () => {
  it('out-bids the best bid by only the minimum increment', () => {
    const rec = computeRecommendedBid(
      { bidBook: book(), realisticExit: 0.94, medianSellerConcession: 0.2 },
      DEFAULT_STRATEGY.bid,
    );
    expect(rec.basis).toBe('outbid-best');
    expect(rec.bid).toBeCloseTo(0.72 + DEFAULT_STRATEGY.bid.minIncrementEth, 6);
    // Crucially it does NOT jump to e.g. 0.80.
    expect(rec.bid!).toBeLessThan(0.73);
  });

  it('caps the bid at the profitability ceiling', () => {
    // best bid already above 97% of exit => cap kicks in.
    const rec = computeRecommendedBid(
      { bidBook: book({ bestBid: 0.95 }), realisticExit: 0.96, medianSellerConcession: 0.1 },
      DEFAULT_STRATEGY.bid,
    );
    expect(rec.basis).toBe('capped-at-exit');
    expect(rec.bid!).toBeCloseTo(0.96 * DEFAULT_STRATEGY.bid.maxBidToExitRatio, 6);
  });

  it('seeds from exit minus concession when there is no book', () => {
    const rec = computeRecommendedBid(
      { bidBook: book({ bestBid: null, secondBid: null, thirdBid: null, offerCount: 0 }), realisticExit: 1.0, medianSellerConcession: 0.2 },
      DEFAULT_STRATEGY.bid,
    );
    expect(rec.basis).toBe('seed-from-exit');
    expect(rec.bid).toBeCloseTo(0.8, 6);
  });

  it('returns no-market when there is neither a book nor an exit', () => {
    const rec = computeRecommendedBid(
      { bidBook: book({ bestBid: null, offerCount: 0 }), realisticExit: null },
      DEFAULT_STRATEGY.bid,
    );
    expect(rec.basis).toBe('no-market');
    expect(rec.bid).toBeNull();
  });
});
