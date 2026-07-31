/**
 * Strategy configuration.
 *
 * Every tunable that governs which opportunities are surfaced lives here (or is
 * overridden per-run via a StrategyConfiguration DB row). Nothing in the
 * scanner should hard-code a threshold — pull it from a StrategyConfig.
 */

export interface StrategyFilters {
  /** Minimum sales in the trailing 24h for a collection to qualify. */
  minSales24h: number;
  /** Minimum trailing 24h volume in ETH. */
  minVolume24hEth: number;
  /** Minimum number of detected accepted offers in 24h. */
  minAcceptedOffers24h: number;
  /** Minimum raw spread (floor - bestBid) / floor. */
  minRawSpread: number;
  /** Minimum expected net ROI on deployed WETH. */
  minExpectedRoi: number;
  /** Reject if the floor fell more than this fraction over 6h. */
  maxFloorDrop6h: number;
  /** Minimum opportunity score (0-100). */
  minOpportunityScore: number;
}

export interface FeeConfig {
  /** OpenSea marketplace fee, basis points (250 = 2.5%). */
  marketplaceFeeBps: number;
  /** Fallback creator royalty in bps when the collection value is unknown. */
  defaultCreatorFeeBps: number;
  /** Flat gas estimate per fill+exit round-trip, in ETH. */
  gasEstimateEth: number;
  /** Extra risk buffer subtracted from expected proceeds, as a fraction of exit. */
  riskBufferPct: number;
}

export interface BidConfig {
  /** Smallest increment we will out-bid a competing offer by, in ETH. */
  minIncrementEth: number;
  /**
   * Cap the recommended bid at this fraction of the realistic exit so we never
   * bid into negative expected value regardless of competition.
   */
  maxBidToExitRatio: number;
}

export interface ExitModelWeights {
  medianRecentSales: number;
  currentFloor: number;
  medianCheapestListings: number;
  shortTermTrend: number;
}

export interface ScoreWeights {
  liquidity: number;
  executableSpread: number;
  acceptedBidActivity: number;
  fillProbability: number;
  exitProbability: number;
  floorStructure: number;
  momentum: number;
  capitalEfficiency: number;
}

export interface StrategyConfig {
  filters: StrategyFilters;
  fees: FeeConfig;
  bid: BidConfig;
  exitWeights: ExitModelWeights;
  scoreWeights: ScoreWeights;
  /** Normalisation ceilings used when scaling raw metrics into 0-100 scores. */
  norms: {
    /** Volume (ETH/24h) that maps to a full liquidity-volume score. */
    volumeFullScoreEth: number;
    /** Sales (count/24h) that maps to a full liquidity-transaction score. */
    salesFullScore: number;
    /** Executable spread that maps to a full spread score. */
    spreadFullScore: number;
    /** Accepted offers (24h) that map to a full accepted-activity score. */
    acceptedOffersFullScore: number;
  };
}

export const DEFAULT_STRATEGY: StrategyConfig = {
  filters: {
    minSales24h: 10,
    minVolume24hEth: 5,
    minAcceptedOffers24h: 2,
    minRawSpread: 0.1,
    minExpectedRoi: 0.08,
    maxFloorDrop6h: 0.15,
    minOpportunityScore: 60,
  },
  fees: {
    marketplaceFeeBps: 250,
    defaultCreatorFeeBps: 50,
    gasEstimateEth: 0.0015,
    riskBufferPct: 0.02,
  },
  bid: {
    minIncrementEth: 0.0005,
    maxBidToExitRatio: 0.97,
  },
  exitWeights: {
    medianRecentSales: 0.4,
    currentFloor: 0.25,
    medianCheapestListings: 0.2,
    shortTermTrend: 0.15,
  },
  scoreWeights: {
    liquidity: 0.25,
    executableSpread: 0.2,
    acceptedBidActivity: 0.15,
    fillProbability: 0.15,
    exitProbability: 0.1,
    floorStructure: 0.05,
    momentum: 0.05,
    capitalEfficiency: 0.05,
  },
  norms: {
    volumeFullScoreEth: 100,
    salesFullScore: 60,
    spreadFullScore: 0.25,
    acceptedOffersFullScore: 15,
  },
};

/** Merge a partial override (from DB / env) onto the default strategy. */
export function resolveStrategy(override?: DeepPartial<StrategyConfig>): StrategyConfig {
  if (!override) return DEFAULT_STRATEGY;
  return {
    filters: { ...DEFAULT_STRATEGY.filters, ...override.filters },
    fees: { ...DEFAULT_STRATEGY.fees, ...override.fees },
    bid: { ...DEFAULT_STRATEGY.bid, ...override.bid },
    exitWeights: { ...DEFAULT_STRATEGY.exitWeights, ...override.exitWeights },
    scoreWeights: { ...DEFAULT_STRATEGY.scoreWeights, ...override.scoreWeights },
    norms: { ...DEFAULT_STRATEGY.norms, ...override.norms },
  };
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
