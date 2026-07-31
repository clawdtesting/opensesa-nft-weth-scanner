import type { OfferRecord, BidBook } from '@/domain/types';

/**
 * Analyse the collection-wide WETH bid book.
 *
 * We rank *collection* offers (the V1 priority) by per-item price, descending.
 * Depth counts how many distinct offers sit within X% of the best bid — a proxy
 * for how much competition there is at the top of the book and therefore how
 * defensible a top position is.
 */
export function analyzeBidBook(
  offers: readonly OfferRecord[],
  opts: { now?: Date; onlyCollection?: boolean } = {},
): BidBook {
  const now = opts.now ?? new Date();
  const onlyCollection = opts.onlyCollection ?? true;

  const live = offers.filter((o) => {
    if (onlyCollection && o.offerType !== 'COLLECTION') return false;
    if (o.expiration && o.expiration.getTime() <= now.getTime()) return false;
    return o.priceEth > 0;
  });

  const sorted = [...live].sort((a, b) => b.priceEth - a.priceEth);

  const bestBid = sorted[0]?.priceEth ?? null;
  const secondBid = sorted[1]?.priceEth ?? null;
  const thirdBid = sorted[2]?.priceEth ?? null;

  const depthWithin = (pct: number): number => {
    if (bestBid === null) return 0;
    const threshold = bestBid * (1 - pct);
    return sorted.filter((o) => o.priceEth >= threshold).length;
  };

  return {
    bestBid,
    secondBid,
    thirdBid,
    offerCount: sorted.length,
    distanceBestToSecond:
      bestBid !== null && secondBid !== null ? bestBid - secondBid : null,
    bidDepth1: depthWithin(0.01),
    bidDepth2: depthWithin(0.02),
    bidDepth5: depthWithin(0.05),
    bidDepth10: depthWithin(0.1),
  };
}
