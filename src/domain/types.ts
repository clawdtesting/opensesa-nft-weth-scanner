/**
 * Domain types for the calculation layer.
 *
 * These are plain data shapes — deliberately decoupled from Prisma models and
 * OpenSea API responses so the pure calculation functions can be unit-tested
 * with hand-written fixtures.
 */

/** A single historical sale, normalised. */
export interface SaleRecord {
  tokenId: string;
  priceEth: number;
  currency: string;
  buyer?: string | null;
  seller?: string | null;
  fromAcceptedOffer: boolean;
  /** Floor price observed at the sale, if known. */
  floorAtSale?: number | null;
  timestamp: Date;
}

/** A single active listing (ask), normalised. */
export interface ListingRecord {
  tokenId?: string | null;
  priceEth: number;
  currency: string;
  endTime?: Date | null;
}

/** A single active offer (bid), normalised. Offers are WETH-denominated. */
export interface OfferRecord {
  tokenId?: string | null;
  priceEth: number;
  currency: string;
  quantity: number;
  offerType: 'COLLECTION' | 'TOKEN' | 'TRAIT';
  offerer?: string | null;
  expiration?: Date | null;
}

/** Bucketed sales-velocity metrics over standard windows. */
export interface VelocityMetrics {
  sales1h: number;
  sales6h: number;
  sales24h: number;
  sales7d: number;
  volume1h: number;
  volume6h: number;
  volume24h: number;
  volume7d: number;
  uniqueBuyers24h: number;
  uniqueSellers24h: number;
  medianSale1h: number | null;
  medianSale6h: number | null;
  medianSale24h: number | null;
  meanSale24h: number | null;
  lastSalePrice: number | null;
  lastSaleTimestamp: Date | null;
}

/** Analysis of the collection bid book. */
export interface BidBook {
  bestBid: number | null;
  secondBid: number | null;
  thirdBid: number | null;
  offerCount: number;
  distanceBestToSecond: number | null;
  /** Number of offers within X% of the best bid. */
  bidDepth1: number;
  bidDepth2: number;
  bidDepth5: number;
  bidDepth10: number;
}

/** Analysis of listing depth near the floor. */
export interface FloorBook {
  floor: number | null;
  listingCount: number;
  floorDepth1: number;
  floorDepth2: number;
  floorDepth5: number;
  floorDepth10: number;
  /** listingsWithin5% / max(sales24h, 1) */
  floorWallRatio: number | null;
  medianCheapest5: number | null;
}

/** Accepted-offer (below-floor seller concession) statistics. */
export interface AcceptedOfferStats {
  acceptedOffers1h: number;
  acceptedOffers6h: number;
  acceptedOffers24h: number;
  acceptedOffers7d: number;
  medianAcceptedPrice: number | null;
  meanAcceptedPrice: number | null;
  medianSellerConcession: number | null;
  concessionP25: number | null;
  concessionP75: number | null;
}

/** Realistic short-term resale price with a transparent breakdown. */
export interface RealisticExit {
  price: number | null;
  confidence: number;
  inputs: {
    medianRecentSales: number | null;
    currentFloor: number | null;
    medianCheapestListings: number | null;
    shortTermTrend: number;
  };
  weights: {
    medianRecentSales: number;
    currentFloor: number;
    medianCheapestListings: number;
    shortTermTrend: number;
  };
  explanation: string;
}

/** Recommended WETH bid with rationale. */
export interface RecommendedBid {
  bid: number | null;
  basis: 'outbid-best' | 'seed-from-exit' | 'capped-at-exit' | 'no-market';
  explanation: string;
}

/** Fee/spread breakdown. */
export interface SpreadResult {
  rawSpread: number | null;
  realisticSpread: number | null;
  marketplaceFee: number;
  creatorFee: number;
  gas: number;
  riskBuffer: number;
  expectedNetProfit: number | null;
  expectedRoi: number | null;
}

/** Fill / exit probabilities + holding time. */
export interface Probabilities {
  fillProbability: number;
  exitProbability24h: number;
  exitProbability72h: number;
  estimatedHoldingHours: number;
}

/** Final opportunity score with full breakdown. */
export interface OpportunityScore {
  score: number;
  components: Record<string, number>;
  weightedComponents: Record<string, number>;
  riskPenalties: Array<{ reason: string; points: number }>;
  reason: string;
}
