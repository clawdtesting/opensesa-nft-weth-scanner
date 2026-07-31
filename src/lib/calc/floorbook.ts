import type { ListingRecord, FloorBook } from '@/domain/types';
import { median } from '@/lib/math';

/**
 * Analyse listing depth near the floor.
 *
 * Floor price alone is misleading: a single cheap listing can create a "floor"
 * with no real liquidity behind it, while a dense wall of listings just above
 * floor signals sell pressure. We therefore count listings within bands of the
 * floor and expose a floor-wall ratio relative to sales velocity.
 */
export function analyzeFloorBook(
  listings: readonly ListingRecord[],
  sales24h: number,
  opts: { now?: Date } = {},
): FloorBook {
  const now = opts.now ?? new Date();
  const live = listings.filter((l) => {
    if (l.endTime && l.endTime.getTime() <= now.getTime()) return false;
    return l.priceEth > 0;
  });

  if (live.length === 0) {
    return {
      floor: null,
      listingCount: 0,
      floorDepth1: 0,
      floorDepth2: 0,
      floorDepth5: 0,
      floorDepth10: 0,
      floorWallRatio: null,
      medianCheapest5: null,
    };
  }

  const sorted = [...live].sort((a, b) => a.priceEth - b.priceEth);
  const floor = sorted[0]!.priceEth;

  const depthWithin = (pct: number): number => {
    const threshold = floor * (1 + pct);
    return sorted.filter((l) => l.priceEth <= threshold).length;
  };

  const floorDepth5 = depthWithin(0.05);
  const cheapest5 = sorted.slice(0, 5).map((l) => l.priceEth);

  return {
    floor,
    listingCount: sorted.length,
    floorDepth1: depthWithin(0.01),
    floorDepth2: depthWithin(0.02),
    floorDepth5,
    floorDepth10: depthWithin(0.1),
    floorWallRatio: floorDepth5 / Math.max(sales24h, 1),
    medianCheapest5: median(cheapest5),
  };
}
