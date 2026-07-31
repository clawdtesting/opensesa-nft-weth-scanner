import type { SaleRecord } from '@/domain/types';
import type { FeeConfig } from '@/config/strategy';
import { bpsToFraction } from '@/lib/money';

/**
 * Deterministic, evidence-based fill & exit models shared by the live paper
 * trader and the backtester. Grounded in *observed sales* rather than opaque
 * randomness so a simulated result is explainable and reproducible.
 */

export interface FillOutcome {
  filled: boolean;
  fillEth?: number;
  filledAt?: Date;
  reason: string;
}

/**
 * A WETH offer at `bid` is considered filled the first time a seller is observed
 * accepting an offer at or below our bid (i.e. an accepted-offer sale priced
 * <= bid occurs after we place it). We pay our bid; the seller's willingness is
 * the evidence. If no such sale occurs within the window, the offer expires.
 */
export function evaluateFill(
  bid: number,
  placedAt: Date,
  subsequentSales: readonly SaleRecord[],
  windowHours: number,
): FillOutcome {
  const deadline = placedAt.getTime() + windowHours * 3_600_000;
  const candidates = subsequentSales
    .filter(
      (s) =>
        s.fromAcceptedOffer &&
        s.timestamp.getTime() >= placedAt.getTime() &&
        s.timestamp.getTime() <= deadline &&
        s.priceEth <= bid,
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const hit = candidates[0];
  if (hit) {
    return {
      filled: true,
      fillEth: bid,
      filledAt: hit.timestamp,
      reason: `Seller accepted an offer at ${hit.priceEth.toFixed(4)} (<= our ${bid.toFixed(4)}) at ${hit.timestamp.toISOString()}.`,
    };
  }
  return { filled: false, reason: `No seller accepted an offer <= ${bid.toFixed(4)} within ${windowHours}h.` };
}

export interface ExitOutcome {
  exited: boolean;
  exitEth: number;
  exitAt: Date;
  grossProfit: number;
  fees: number;
  gas: number;
  netProfit: number;
  roi: number;
  holdingHours: number;
  reason: string;
}

/**
 * After filling at `entry`, we list the NFT at `target` (the realistic exit) and
 * exit the first time a buyer is observed paying >= target. If none appears
 * within `maxHoldHours`, we force a mark-to-market close at the last observed
 * sale price (or `fallbackPrice`), which realistically models being stuck.
 */
export function evaluateExit(params: {
  entry: number;
  target: number;
  filledAt: Date;
  subsequentSales: readonly SaleRecord[];
  maxHoldHours: number;
  fees: FeeConfig;
  marketplaceFeeBps: number;
  creatorFeeBps: number;
  fallbackPrice?: number | null;
}): ExitOutcome {
  const { entry, target, filledAt, subsequentSales, maxHoldHours, fees } = params;
  const deadline = filledAt.getTime() + maxHoldHours * 3_600_000;

  const buyer = subsequentSales
    .filter((s) => s.timestamp.getTime() > filledAt.getTime() && s.timestamp.getTime() <= deadline && s.priceEth >= target)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0];

  let exitEth: number;
  let exitAt: Date;
  let reason: string;

  if (buyer) {
    exitEth = target;
    exitAt = buyer.timestamp;
    reason = `Sold at target ${target.toFixed(4)} (market cleared ${buyer.priceEth.toFixed(4)}).`;
  } else {
    // Forced close at the last observed sale within window, else fallback.
    const inWindow = subsequentSales
      .filter((s) => s.timestamp.getTime() > filledAt.getTime() && s.timestamp.getTime() <= deadline)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    exitEth = inWindow[0]?.priceEth ?? params.fallbackPrice ?? entry;
    exitAt = new Date(deadline);
    reason = `No buyer at target within ${maxHoldHours}h; marked to market at ${exitEth.toFixed(4)}.`;
  }

  const marketplaceFee = exitEth * bpsToFraction(params.marketplaceFeeBps);
  const creatorFee = exitEth * bpsToFraction(params.creatorFeeBps);
  const totalFees = marketplaceFee + creatorFee;
  const grossProfit = exitEth - entry;
  const netProfit = grossProfit - totalFees - fees.gasEstimateEth;
  const roi = entry > 0 ? netProfit / entry : 0;
  const holdingHours = (exitAt.getTime() - filledAt.getTime()) / 3_600_000;

  return {
    exited: true,
    exitEth,
    exitAt,
    grossProfit,
    fees: totalFees,
    gas: fees.gasEstimateEth,
    netProfit,
    roi,
    holdingHours,
    reason,
  };
}
