import type { SaleRecord, ListingRecord, OfferRecord } from '@/domain/types';

/**
 * Deterministic market archetypes used by both the test-suite and the seed
 * script. Each factory returns a coherent set of sales/listings/offers relative
 * to a `now` reference so the analysis pipeline can be exercised against known
 * market shapes. A tiny seeded PRNG keeps output reproducible.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOUR = 3_600_000;

export interface MarketFixture {
  name: string;
  description: string;
  sales: SaleRecord[];
  listings: ListingRecord[];
  offers: OfferRecord[];
  marketplaceFeeBps: number;
  creatorFeeBps: number;
}

interface GenParams {
  now: Date;
  seed: number;
}

function sale(
  priceEth: number,
  ageMs: number,
  now: Date,
  opts: { accepted?: boolean; buyer?: string; seller?: string; floorAtSale?: number } = {},
): SaleRecord {
  return {
    tokenId: String(Math.floor(1000 + priceEth * 1000 + ageMs)),
    priceEth,
    currency: opts.accepted ? 'WETH' : 'ETH',
    buyer: opts.buyer ?? `0xbuyer${Math.floor(ageMs / HOUR)}`,
    seller: opts.seller ?? `0xseller${Math.floor(ageMs / HOUR)}`,
    fromAcceptedOffer: opts.accepted ?? false,
    floorAtSale: opts.floorAtSale ?? null,
    timestamp: new Date(now.getTime() - ageMs),
  };
}

function listing(priceEth: number): ListingRecord {
  return { priceEth, currency: 'ETH', endTime: null };
}

function offer(priceEth: number, offerer: string): OfferRecord {
  return {
    tokenId: null,
    priceEth,
    currency: 'WETH',
    quantity: 1,
    offerType: 'COLLECTION',
    offerer,
    expiration: null,
  };
}

/** Healthy, liquid collection: strong volume, many tx, active accepted offers. */
export function healthyLiquid({ now, seed }: GenParams): MarketFixture {
  const rng = mulberry32(seed);
  const floor = 1.0;
  const sales: SaleRecord[] = [];
  // 40 sales over 24h, ~1/3 from accepted WETH offers below floor.
  for (let i = 0; i < 40; i += 1) {
    const age = (i / 40) * 24 * HOUR + rng() * HOUR * 0.2;
    const accepted = i % 3 === 0;
    const price = accepted ? floor * (0.78 + rng() * 0.08) : floor * (0.97 + rng() * 0.06);
    sales.push(sale(price, age, now, { accepted, floorAtSale: floor, buyer: `0xb${i}`, seller: `0xs${i}` }));
  }
  const listings = [1.0, 1.01, 1.01, 1.02, 1.03, 1.04, 1.05, 1.08].map(listing);
  const offers = [0.72, 0.71, 0.705, 0.7, 0.69, 0.66].map((p, i) => offer(p, `0xbidder${i}`));
  return {
    name: 'Healthy Liquid',
    description: 'High volume, high transaction count, active below-floor WETH offers.',
    sales,
    listings,
    offers,
    marketplaceFeeBps: 250,
    creatorFeeBps: 50,
  };
}

/** Dead collection with a huge headline spread but no real liquidity. */
export function deadGiantSpread({ now }: GenParams): MarketFixture {
  const sales: SaleRecord[] = [sale(2.0, 30 * HOUR, now)]; // one old sale
  const listings = [2.0, 5.0, 9.0].map(listing);
  const offers = [0.3].map((p, i) => offer(p, `0xdesperate${i}`));
  return {
    name: 'Dead / Giant Spread',
    description: 'Enormous floor-to-bid gap but essentially no trading — a trap.',
    sales,
    listings,
    offers,
    marketplaceFeeBps: 250,
    creatorFeeBps: 500,
  };
}

/** Rapidly falling floor — momentum is against us. */
export function fallingFloor({ now, seed }: GenParams): MarketFixture {
  const rng = mulberry32(seed);
  const sales: SaleRecord[] = [];
  for (let i = 0; i < 24; i += 1) {
    const age = (i / 24) * 24 * HOUR;
    // i=0 is the most recent sale; older sales (higher i) were priced higher, so
    // recent prices are much lower => a strong downward trend.
    const decliningPrice = 0.8 + (i / 24) * 0.6 + rng() * 0.05;
    sales.push(sale(decliningPrice, age, now, { accepted: i % 4 === 0, floorAtSale: decliningPrice }));
  }
  const listings = [0.78, 0.8, 0.82, 0.85, 0.9].map(listing);
  const offers = [0.6, 0.58, 0.55].map((p, i) => offer(p, `0xbidder${i}`));
  return {
    name: 'Falling Floor',
    description: 'Floor dropping fast over the last several hours; downward momentum.',
    sales,
    listings,
    offers,
    marketplaceFeeBps: 250,
    creatorFeeBps: 250,
  };
}

/** Thin floor: a single cheap listing then a big gap (fake-floor risk). */
export function thinFakeFloor({ now, seed }: GenParams): MarketFixture {
  const rng = mulberry32(seed);
  const sales: SaleRecord[] = [];
  for (let i = 0; i < 12; i += 1) {
    const age = (i / 12) * 24 * HOUR;
    sales.push(sale(1.4 + rng() * 0.1, age, now, { accepted: i % 6 === 0, floorAtSale: 1.4 }));
  }
  const listings = [1.0, 1.5, 1.55, 1.6].map(listing); // isolated 1.0 then wall at 1.5
  const offers = [0.9, 0.85].map((p, i) => offer(p, `0xbidder${i}`));
  return {
    name: 'Thin / Fake Floor',
    description: 'One isolated cheap listing creating a misleading floor.',
    sales,
    listings,
    offers,
    marketplaceFeeBps: 250,
    creatorFeeBps: 100,
  };
}

/** High volume but concentrated in very few transactions (possible wash). */
export function highVolumeLowTx({ now }: GenParams): MarketFixture {
  const sales: SaleRecord[] = [
    sale(20, 2 * HOUR, now, { buyer: '0xwash', seller: '0xwash2' }),
    sale(20, 5 * HOUR, now, { buyer: '0xwash2', seller: '0xwash' }),
  ];
  const listings = [1.0, 1.2, 1.5].map(listing);
  const offers = [0.6, 0.55].map((p, i) => offer(p, `0xbidder${i}`));
  return {
    name: 'High Volume / Low Tx',
    description: 'Large volume from only a couple of trades (mean ≫ median).',
    sales,
    listings,
    offers,
    marketplaceFeeBps: 250,
    creatorFeeBps: 250,
  };
}

/** Strong seller acceptance of below-floor offers — the ideal target. */
export function highAcceptedBid({ now, seed }: GenParams): MarketFixture {
  const rng = mulberry32(seed);
  const floor = 1.0;
  const sales: SaleRecord[] = [];
  for (let i = 0; i < 30; i += 1) {
    const age = (i / 30) * 24 * HOUR;
    const accepted = i % 2 === 0; // half the sales are accepted offers
    const price = accepted ? floor * (0.82 + rng() * 0.03) : floor * (0.98 + rng() * 0.04);
    sales.push(sale(price, age, now, { accepted, floorAtSale: floor, buyer: `0xb${i}`, seller: `0xs${i}` }));
  }
  const listings = [1.0, 1.01, 1.02, 1.03, 1.05, 1.06].map(listing);
  const offers = [0.84, 0.83, 0.82, 0.8].map((p, i) => offer(p, `0xbidder${i}`));
  return {
    name: 'High Accepted-Bid',
    description: 'Sellers frequently accept WETH offers well below floor; deep bid book.',
    sales,
    listings,
    offers,
    marketplaceFeeBps: 250,
    creatorFeeBps: 50,
  };
}

export const ALL_FIXTURES: Array<(p: GenParams) => MarketFixture> = [
  healthyLiquid,
  highAcceptedBid,
  deadGiantSpread,
  fallingFloor,
  thinFakeFloor,
  highVolumeLowTx,
];
