import type {
  OpportunityScore,
  VelocityMetrics,
  BidBook,
  FloorBook,
  AcceptedOfferStats,
  SpreadResult,
  Probabilities,
} from '@/domain/types';
import type { StrategyConfig } from '@/config/strategy';
import { clamp, logScore, linearScore } from '@/lib/math';

export interface ScoreInputs {
  velocity: VelocityMetrics;
  bidBook: BidBook;
  floorBook: FloorBook;
  accepted: AcceptedOfferStats;
  spread: SpreadResult;
  probabilities: Probabilities;
  capitalEfficiency: number | null;
  /** Floor change over 6h as a fraction (negative = falling). */
  floorChange6h: number | null;
  trend: number;
}

/**
 * Compute the 0-100 opportunity score.
 *
 * The score is a weighted blend of eight normalised components, then risk
 * penalties are subtracted. Every component and penalty is returned so the
 * dashboard can render an auditable "why this ranks" breakdown. The final number
 * is NOT a promise of profit — it is a relative ranking of risk-adjusted edge.
 */
export function computeOpportunityScore(inputs: ScoreInputs, cfg: StrategyConfig): OpportunityScore {
  const { velocity, bidBook, floorBook, accepted, spread, probabilities } = inputs;
  const w = cfg.scoreWeights;
  const norms = cfg.norms;

  // ---- Components (each 0-100) -----------------------------------------
  const volumeScore = logScore(velocity.volume24h, norms.volumeFullScoreEth);
  const txScore = logScore(velocity.sales24h, norms.salesFullScore);
  const liquidity = (volumeScore + txScore) / 2;

  const executableSpread = linearScore(spread.expectedRoi ?? 0, norms.spreadFullScore);

  const acceptedCountScore = linearScore(accepted.acceptedOffers24h, norms.acceptedOffersFullScore);
  const concessionScore = clamp((accepted.medianSellerConcession ?? 0) * 200, 0, 100);
  const acceptedBidActivity = 0.6 * acceptedCountScore + 0.4 * concessionScore;

  const fillProbability = probabilities.fillProbability * 100;
  const exitProbability = probabilities.exitProbability24h * 100;

  // Floor structure: healthy = shallow wall relative to sales. Invert the ratio.
  const wall = floorBook.floorWallRatio;
  const floorStructure =
    wall === null ? 50 : clamp(100 - wall * 20, 0, 100);

  // Momentum: trend mapped from [-1,1] to [0,100], centred at 50.
  const momentum = clamp(50 + inputs.trend * 50, 0, 100);

  // Capital efficiency normalised on a log curve (values are tiny per-hour).
  const capitalEfficiency =
    inputs.capitalEfficiency === null ? 0 : logScore(inputs.capitalEfficiency * 1_000_000, 1_000_000);

  const components: Record<string, number> = {
    liquidity,
    executableSpread,
    acceptedBidActivity,
    fillProbability,
    exitProbability,
    floorStructure,
    momentum,
    capitalEfficiency,
  };

  const weightedComponents: Record<string, number> = {
    liquidity: liquidity * w.liquidity,
    executableSpread: executableSpread * w.executableSpread,
    acceptedBidActivity: acceptedBidActivity * w.acceptedBidActivity,
    fillProbability: fillProbability * w.fillProbability,
    exitProbability: exitProbability * w.exitProbability,
    floorStructure: floorStructure * w.floorStructure,
    momentum: momentum * w.momentum,
    capitalEfficiency: capitalEfficiency * w.capitalEfficiency,
  };

  let score = Object.values(weightedComponents).reduce((a, b) => a + b, 0);

  // ---- Risk penalties ---------------------------------------------------
  const riskPenalties: Array<{ reason: string; points: number }> = [];
  const penalise = (reason: string, points: number) => {
    riskPenalties.push({ reason, points });
    score -= points;
  };

  if (velocity.sales6h === 0) penalise('No sales in the last 6h', 10);
  if (velocity.sales24h < 5) penalise('Very low transaction count (<5 in 24h)', 10);
  if ((inputs.floorChange6h ?? 0) < -cfg.filters.maxFloorDrop6h)
    penalise(`Floor falling fast (${((inputs.floorChange6h ?? 0) * 100).toFixed(1)}% / 6h)`, 15);
  if ((floorBook.floorWallRatio ?? 0) > 5)
    penalise('Very large floor wall relative to sales', 8);
  if (bidBook.offerCount > 0 && bidBook.bidDepth1 <= 1 && bidBook.offerCount === 1)
    penalise('Extremely thin bidding (single offer)', 5);
  if (bidBook.bidDepth1 >= 8) penalise('Extreme bid concentration at top of book', 5);
  // One abnormal sale distorting the mean vs median.
  if (
    velocity.meanSale24h !== null &&
    velocity.medianSale24h !== null &&
    velocity.medianSale24h > 0 &&
    velocity.meanSale24h / velocity.medianSale24h > 3
  )
    penalise('Possible single-sale volume distortion (mean ≫ median)', 8);
  // Fake floor: a lone cheap listing with nothing behind it.
  if (floorBook.listingCount > 0 && floorBook.floorDepth10 === 1)
    penalise('Possible fake floor (isolated cheap listing)', 6);

  score = clamp(score, 0, 100);

  const reason = buildReason(inputs, components, riskPenalties);

  return { score, components, weightedComponents, riskPenalties, reason };
}

function buildReason(
  inputs: ScoreInputs,
  components: Record<string, number>,
  penalties: Array<{ reason: string; points: number }>,
): string {
  const pos: string[] = [];
  const { velocity, accepted, spread } = inputs;
  if (velocity.sales24h >= 10) pos.push(`${velocity.sales24h} sales in 24h`);
  if (accepted.acceptedOffers24h > 0)
    pos.push(`${accepted.acceptedOffers24h} accepted offers`);
  if (accepted.medianSellerConcession && accepted.medianSellerConcession > 0)
    pos.push(`median accepted discount ${(accepted.medianSellerConcession * 100).toFixed(1)}%`);
  if (spread.expectedRoi && spread.expectedRoi > 0)
    pos.push(`executable ROI ${(spread.expectedRoi * 100).toFixed(1)}%`);
  if ((components.floorStructure ?? 0) > 70) pos.push('thin floor wall');
  if (inputs.trend > 0.02) pos.push('positive momentum');

  const posTxt = pos.length ? `+ ${pos.join('\n+ ')}` : '';
  const negTxt = penalties.length
    ? `- ${penalties.map((p) => `${p.reason} (-${p.points})`).join('\n- ')}`
    : '';
  return [posTxt, negTxt].filter(Boolean).join('\n');
}
