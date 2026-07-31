import { describe, it, expect } from 'vitest';
import { analyzeFloorBook } from '@/lib/calc/floorbook';
import type { ListingRecord } from '@/domain/types';

const l = (priceEth: number, endTime: Date | null = null): ListingRecord => ({
  priceEth,
  currency: 'ETH',
  endTime,
});

describe('analyzeFloorBook', () => {
  it('distinguishes a deep floor from a thin one', () => {
    const deep = analyzeFloorBook([l(1.0), l(1.01), l(1.01), l(1.02), l(1.03)], 20);
    const thin = analyzeFloorBook([l(1.0), l(1.4), l(1.5)], 20);
    expect(deep.floorDepth5).toBeGreaterThan(thin.floorDepth5);
    expect(deep.floor).toBe(1.0);
    expect(thin.floorDepth5).toBe(1); // only the 1.0 listing within 5%
  });

  it('computes the floor wall ratio relative to sales', () => {
    const book = analyzeFloorBook([l(1.0), l(1.02), l(1.03), l(1.04)], 2);
    // 4 listings within 5% / max(2,1) = 2
    expect(book.floorDepth5).toBe(4);
    expect(book.floorWallRatio).toBeCloseTo(2, 5);
  });

  it('excludes expired listings', () => {
    const past = new Date(Date.now() - 1000);
    const book = analyzeFloorBook([l(0.5, past), l(1.0)], 5);
    expect(book.floor).toBe(1.0);
    expect(book.listingCount).toBe(1);
  });

  it('handles empty listings', () => {
    const book = analyzeFloorBook([], 5);
    expect(book.floor).toBeNull();
    expect(book.floorWallRatio).toBeNull();
  });
});
