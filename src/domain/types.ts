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

// ---------------------------------------------------------------------------
// Drops / mint discovery (Ethereum only)
// ---------------------------------------------------------------------------

export type DropCategory = 'upcoming' | 'featured' | 'recently_minted';

/** A normalised OpenSea drop, plus optional enrichment from the scanner. */
export interface DropItem {
  slug: string;
  name: string;
  chain: string;
  imageUrl: string | null;
  contract: string | null;
  openseaUrl: string | null;
  featured: boolean;

  // Mint details — any of these may be unknown (null), never fabricated.
  mintPriceEth: number | null;
  mintCurrency: string | null;
  mintStart: string | null; // ISO timestamp
  mintEnd: string | null; // ISO timestamp
  mintStage: string | null;
  maxPerWallet: number | null;
  totalSupply: number | null;
  /** Derived on the server at fetch time; the client recomputes live. */
  isLive: boolean;
  /** True when this drop first appeared since the previous refresh. */
  isNew?: boolean;

  /** Optional enrichment from existing scanner data when the collection exists. */
  scanner?: {
    floor: number | null;
    bestBid: number | null;
    volume24h: number | null;
    offerToFloorSpread: number | null;
    score: number | null;
    hasData: boolean;
  };
}

// ---------------------------------------------------------------------------
// Robinhood chain — newly minted collections
// ---------------------------------------------------------------------------

/**
 * A newly created collection on the Robinhood chain, enriched with the metrics
 * the Robinhood tab filters on (holders, item count, 24h/96h volume). Any metric
 * may be unknown (null) — values are never fabricated.
 */
export interface RobinhoodCollection {
  slug: string;
  name: string;
  chain: string;
  imageUrl: string | null;
  contract: string | null;
  openseaUrl: string | null;

  /** Number of unique holders/owners (OpenSea stats `num_owners`). */
  holders: number | null;
  /** How many items are in the collection (`total_supply`). */
  itemCount: number | null;
  floorEth: number | null;
  /** Trailing 24h traded volume in ETH (OpenSea `one_day` interval). */
  volume24hEth: number | null;
  /** Trailing 96h traded volume in ETH, summed from sale events (best-effort). */
  volume96hEth: number | null;
  totalVolumeEth: number | null;
}

// ---------------------------------------------------------------------------
// Chain discovery — newly-minting NFT & token contracts on Robinhood chain
// ---------------------------------------------------------------------------

export type ContractKind = 'ERC-20' | 'ERC-721' | 'ERC-1155' | 'unknown';

/** A contract seen minting in the recent block window. */
export interface DiscoveredContract {
  address: string;
  kind: ContractKind;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  /** Most recent block in which we saw a mint from this contract. */
  lastBlock: number;
  /** True when the contract had no code at the scan window's start block —
   * i.e. it was deployed *within* the scanned range (a genuinely new drop). */
  isNew: boolean;
}

export interface ChainScanResult {
  contracts: DiscoveredContract[];
  fromBlock: number;
  toBlock: number;
  scannedAt: string; // ISO
  note?: string;
}

// ---------------------------------------------------------------------------
// Floor sniper — fetch a specific collection by contract address, then buy
// ---------------------------------------------------------------------------

/** The cheapest active listing (the floor), with the data needed to fulfill it. */
export interface FloorListing {
  /** OpenSea order hash — the handle used to request fulfillment data. */
  orderHash: string;
  /** Per-item price in ETH. */
  priceEth: number;
  currency: string;
  /** Seaport protocol contract the order was created against. */
  protocolAddress: string | null;
  /** Specific token id being sold, when the listing is for a single NFT. */
  tokenId: string | null;
}

/**
 * A collection resolved from a pasted contract address, with its live floor.
 * Any field may be null before the drop is indexed/listed on OpenSea.
 */
export interface SnipeTarget {
  chain: string;
  contract: string;
  slug: string | null;
  name: string | null;
  imageUrl: string | null;
  openseaUrl: string | null;
  floorEth: number | null;
  bestListing: FloorListing | null;
  /** The cheapest listings (up to 10), ascending by price. */
  floorListings: FloorListing[];
  /** Highest collection-wide offer (the best bid), per item, in ETH/WETH. */
  bestOfferEth: number | null;
  /** True when server wallet credentials (PRIVATE_KEY + RPC_URL) are configured. */
  executorReady: boolean;
  fetchedAt: string; // ISO timestamp
  note?: string;
}
