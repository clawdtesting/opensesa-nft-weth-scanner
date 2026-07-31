import type { SpreadResult } from '@/domain/types';
import type { FeeConfig } from '@/config/strategy';
import { bpsToFraction } from '@/lib/money';

export interface SpreadInputs {
  floor: number | null;
  bestBid: number | null;
  realisticExit: number | null;
  recommendedBid: number | null;
  marketplaceFeeBps: number;
  creatorFeeBps: number;
}

/**
 * Compute raw, realistic and net spreads plus expected net profit and ROI.
 *
 *   rawSpread       = (floor - bestBid) / floor           (headline, misleading)
 *   realisticSpread = (realisticExit - recommendedBid) / recommendedBid
 *
 * Net profit is what remains of the resale proceeds after every real cost:
 * marketplace fee + creator royalty (charged on the *exit* proceeds), the flat
 * gas estimate, and a risk buffer sized as a fraction of the exit price.
 *
 * ROI is expressed against deployed capital (the recommended bid) so it is
 * directly comparable across collections of very different price levels.
 */
export function computeSpread(inputs: SpreadInputs, fees: FeeConfig): SpreadResult {
  const { floor, bestBid, realisticExit, recommendedBid } = inputs;

  const rawSpread =
    floor !== null && floor > 0 && bestBid !== null ? (floor - bestBid) / floor : null;

  const realisticSpread =
    realisticExit !== null && recommendedBid !== null && recommendedBid > 0
      ? (realisticExit - recommendedBid) / recommendedBid
      : null;

  let marketplaceFee = 0;
  let creatorFee = 0;
  let riskBuffer = 0;
  let expectedNetProfit: number | null = null;
  let expectedRoi: number | null = null;

  if (realisticExit !== null && recommendedBid !== null && recommendedBid > 0) {
    marketplaceFee = realisticExit * bpsToFraction(inputs.marketplaceFeeBps);
    creatorFee = realisticExit * bpsToFraction(inputs.creatorFeeBps);
    riskBuffer = realisticExit * fees.riskBufferPct;
    expectedNetProfit =
      realisticExit -
      recommendedBid -
      marketplaceFee -
      creatorFee -
      fees.gasEstimateEth -
      riskBuffer;
    expectedRoi = expectedNetProfit / recommendedBid;
  }

  return {
    rawSpread,
    realisticSpread,
    marketplaceFee,
    creatorFee,
    gas: fees.gasEstimateEth,
    riskBuffer,
    expectedNetProfit,
    expectedRoi,
  };
}
