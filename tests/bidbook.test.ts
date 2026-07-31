import { describe, it, expect } from 'vitest';
import { analyzeBidBook } from '@/lib/calc/bidbook';
import type { OfferRecord } from '@/domain/types';

function o(priceEth: number, type: OfferRecord['offerType'] = 'COLLECTION', expiration: Date | null = null): OfferRecord {
  return { tokenId: null, priceEth, currency: 'WETH', quantity: 1, offerType: type, offerer: '0x', expiration };
}

describe('analyzeBidBook', () => {
  it('ranks the top three bids and computes distance', () => {
    const book = analyzeBidBook([o(0.7), o(0.61), o(0.5), o(0.4)]);
    expect(book.bestBid).toBe(0.7);
    expect(book.secondBid).toBe(0.61);
    expect(book.thirdBid).toBe(0.5);
    expect(book.distanceBestToSecond).toBeCloseTo(0.09, 5);
    expect(book.offerCount).toBe(4);
  });

  it('measures depth within pct bands of the best bid', () => {
    // best 1.0; within 5% => >=0.95 : 1.0 and 0.96 (2 offers)
    const book = analyzeBidBook([o(1.0), o(0.96), o(0.9), o(0.8)]);
    expect(book.bidDepth5).toBe(2);
    expect(book.bidDepth10).toBe(3);
  });

  it('ignores expired and non-collection offers by default', () => {
    const past = new Date(Date.now() - 1000);
    const book = analyzeBidBook([o(1.0, 'COLLECTION', past), o(0.9, 'TOKEN'), o(0.8, 'COLLECTION')]);
    expect(book.bestBid).toBe(0.8);
    expect(book.offerCount).toBe(1);
  });

  it('returns nulls for an empty book', () => {
    const book = analyzeBidBook([]);
    expect(book.bestBid).toBeNull();
    expect(book.distanceBestToSecond).toBeNull();
    expect(book.bidDepth1).toBe(0);
  });
});
