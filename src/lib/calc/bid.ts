import type { RecommendedBid, BidBook } from '@/domain/types';
import type { BidConfig } from '@/config/strategy';
import { round } from '@/lib/math';

export interface BidInputs {
  bidBook: BidBook;
  realisticExit: number | null;
  /** Typical seller concession to floor (fraction), used when there is no book. */
  medianSellerConcession?: number | null;
}

/**
 * Recommended WETH bid.
 *
 * Principle: don't over-bid. If there is a competing best bid we only need to
 * beat it by the minimum increment to hold top position — bidding 0.80 when
 * 0.725 keeps first place just burns spread. When there is no book we seed a
 * bid from the realistic exit discounted by the typical seller concession.
 *
 * The bid is always capped at `maxBidToExitRatio * realisticExit` so we never
 * recommend a bid that guarantees negative expected value.
 */
export function computeRecommendedBid(inputs: BidInputs, cfg: BidConfig): RecommendedBid {
  const { bestBid } = inputs.bidBook;
  const exit = inputs.realisticExit;

  const cap = exit !== null ? exit * cfg.maxBidToExitRatio : null;

  // Case 1: there is a competing best bid — out-bid it by the min increment.
  if (bestBid !== null && bestBid > 0) {
    let bid = bestBid + cfg.minIncrementEth;
    let basis: RecommendedBid['basis'] = 'outbid-best';
    let explanation = `Best competing bid ${bestBid.toFixed(4)} WETH; recommend ${round(bid).toFixed(4)} (+${cfg.minIncrementEth}) to hold top position.`;

    if (cap !== null && bid > cap) {
      bid = cap;
      basis = 'capped-at-exit';
      explanation = `Best competing bid ${bestBid.toFixed(4)} WETH would require bidding past the profitability cap; capped at ${round(cap).toFixed(4)} (${(cfg.maxBidToExitRatio * 100).toFixed(0)}% of realistic exit).`;
    }
    return { bid: round(bid), basis, explanation };
  }

  // Case 2: no bid book — seed from the realistic exit and typical concession.
  if (exit !== null) {
    const concession = inputs.medianSellerConcession ?? 0.1;
    let bid = exit * (1 - Math.max(concession, 0));
    if (cap !== null && bid > cap) bid = cap;
    return {
      bid: round(bid),
      basis: 'seed-from-exit',
      explanation: `No competing collection offers; seed bid at exit ${exit.toFixed(4)} minus typical seller concession ${(Math.max(concession, 0) * 100).toFixed(1)}% = ${round(bid).toFixed(4)} WETH.`,
    };
  }

  return {
    bid: null,
    basis: 'no-market',
    explanation: 'Insufficient data (no bids and no realistic exit) to recommend a bid.',
  };
}
