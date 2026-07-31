import type { SaleRecord, ListingRecord, OfferRecord } from '@/domain/types';
import type { OSEvent, OSListing, OSOffer, OSCollection } from './types';
import { weiToEth } from '@/lib/money';

/**
 * Known WETH contract addresses per chain (lower-cased). Offers are denominated
 * in WETH; sales settled in WETH are our accepted-offer signal.
 */
const WETH_ADDRESSES = new Set(
  [
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // Ethereum mainnet WETH
    '0x4200000000000000000000000000000000000006', // Base / Optimism WETH
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // Arbitrum WETH
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', // Polygon WETH
  ].map((a) => a.toLowerCase()),
);

const ZERO = '0x0000000000000000000000000000000000000000';

function symbolFor(tokenAddress: string | undefined, fallback: string | undefined): string {
  if (!tokenAddress || tokenAddress.toLowerCase() === ZERO) return 'ETH';
  if (WETH_ADDRESSES.has(tokenAddress.toLowerCase())) return 'WETH';
  return (fallback ?? 'UNKNOWN').toUpperCase();
}

/** Parse a `sale` event into a normalised SaleRecord (null if not a valid sale). */
export function parseSaleEvent(ev: OSEvent): SaleRecord | null {
  if (ev.event_type !== 'sale') return null;
  const payment = ev.payment;
  if (!payment || !payment.quantity) return null;
  const priceEth = weiToEth(payment.quantity, payment.decimals ?? 18);
  if (!Number.isFinite(priceEth) || priceEth <= 0) return null;
  const currency = symbolFor(payment.token_address, payment.symbol);
  return {
    tokenId: ev.nft?.identifier ?? 'unknown',
    priceEth,
    currency,
    buyer: ev.buyer ?? null,
    seller: ev.seller ?? null,
    // Sales settled in WETH almost always originate from an accepted offer.
    fromAcceptedOffer: currency === 'WETH',
    floorAtSale: null,
    timestamp: new Date((ev.event_timestamp ?? 0) * 1000),
  };
}

/** Deterministic identity for a sale event, used for dedup. */
export function saleEventId(ev: OSEvent): string {
  if (ev.transaction) return `tx:${ev.transaction}:${ev.nft?.identifier ?? ''}`;
  if (ev.order_hash) return `order:${ev.order_hash}`;
  return `sale:${ev.nft?.contract ?? ''}:${ev.nft?.identifier ?? ''}:${ev.event_timestamp ?? 0}`;
}

/** Extract the per-item ETH price from a listing's price block or Seaport data. */
export function parseListing(l: OSListing): ListingRecord | null {
  const price = l.price?.current;
  let priceEth: number | null = null;
  let currency = 'ETH';
  let endTime: Date | null = null;

  if (price?.value) {
    priceEth = weiToEth(price.value, price.decimals ?? 18);
    currency = (price.currency ?? 'ETH').toUpperCase();
  } else if (l.protocol_data) {
    // Fall back to summing the consideration (what the seller receives).
    const cons = l.protocol_data.parameters.consideration ?? [];
    const total = cons.reduce((sum, c) => sum + weiToEth(c.startAmount, 18), 0);
    priceEth = total > 0 ? total : null;
  }

  if (l.protocol_data?.parameters.endTime) {
    endTime = new Date(Number(l.protocol_data.parameters.endTime) * 1000);
  }

  if (priceEth === null || priceEth <= 0) return null;
  return {
    tokenId: l.protocol_data?.parameters.offer?.[0]?.identifierOrCriteria ?? null,
    priceEth,
    currency,
    endTime,
  };
}

/** Parse a collection offer into a normalised, per-item OfferRecord. */
export function parseOffer(o: OSOffer): OfferRecord | null {
  const price = o.price;
  if (!price?.value) return null;
  const quantity = quantityFromProtocol(o) ?? 1;
  const totalEth = weiToEth(price.value, price.decimals ?? 18);
  // OpenSea's `price.value` for a collection offer is the total for `quantity`
  // items; normalise to per-item so bids are comparable to floor/listing prices.
  const priceEth = quantity > 0 ? totalEth / quantity : totalEth;
  if (!Number.isFinite(priceEth) || priceEth <= 0) return null;

  const currency = (price.currency ?? 'WETH').toUpperCase();
  let expiration: Date | null = null;
  if (o.protocol_data?.parameters.endTime) {
    expiration = new Date(Number(o.protocol_data.parameters.endTime) * 1000);
  }

  return {
    tokenId: null, // collection-wide
    priceEth,
    currency,
    quantity,
    offerType: o.criteria?.trait ? 'TRAIT' : 'COLLECTION',
    offerer: o.protocol_data?.parameters.offerer ?? null,
    expiration,
  };
}

function quantityFromProtocol(o: OSOffer): number | null {
  const cons = o.protocol_data?.parameters.consideration;
  if (!cons?.length) return null;
  // For a collection offer the consideration includes the NFT criteria item(s);
  // its startAmount encodes the quantity requested.
  const nftItem = cons.find((c) => c.itemType === 4 || c.itemType === 2 || c.itemType === 3);
  const qty = nftItem ? Number(nftItem.startAmount) : NaN;
  return Number.isFinite(qty) && qty > 0 ? qty : null;
}

/** Extract marketplace + creator fee basis points from a collection payload. */
export function parseFees(c: OSCollection): { marketplaceFeeBps: number; creatorFeeBps: number } {
  let marketplaceFeeBps = 250;
  let creatorFeeBps = 0;
  for (const fee of c.fees ?? []) {
    const bps = Math.round((fee.fee ?? 0) * 100); // 2.5 -> 250
    // OpenSea's own fee recipient is the marketplace fee; everything else is a
    // creator royalty that also applies to offer settlement.
    if (isOpenSeaRecipient(fee.recipient)) {
      marketplaceFeeBps = bps;
    } else {
      creatorFeeBps += bps;
    }
  }
  return { marketplaceFeeBps, creatorFeeBps };
}

function isOpenSeaRecipient(recipient: string): boolean {
  const r = (recipient ?? '').toLowerCase();
  // OpenSea fee wallet(s). Kept as a set so new recipients can be added easily.
  return r === '0x0000a26b00c1f0df003000390027140000faa719';
}
