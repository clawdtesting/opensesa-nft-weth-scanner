/**
 * Minimal typings for the subset of the OpenSea API v2 responses we consume.
 * These describe the wire format; `parse.ts` normalises them into domain types.
 * See docs/OPENSEA_API.md for the endpoint catalogue.
 */

export interface OSPaymentToken {
  symbol: string;
  address: string;
  decimals: number;
  chain?: string;
}

export interface OSFee {
  fee: number; // percentage, e.g. 2.5
  recipient: string;
  required: boolean;
}

export interface OSCollection {
  collection: string; // slug
  name: string;
  description?: string;
  image_url?: string;
  opensea_url?: string;
  total_supply?: number;
  contracts?: Array<{ address: string; chain: string }>;
  fees?: OSFee[];
  payment_tokens?: OSPaymentToken[];
}

export interface OSCollectionListItem {
  collection: string;
  name: string;
  image_url?: string;
  contracts?: Array<{ address: string; chain: string }>;
}

export interface OSCollectionsResponse {
  collections: OSCollectionListItem[];
  next?: string | null;
}

/** GET /chain/{chain}/contract/{address} — resolves a contract to its collection. */
export interface OSContract {
  address: string;
  chain: string;
  collection?: string; // slug
  contract_standard?: string; // e.g. "erc721"
  name?: string;
  total_supply?: number;
}

export interface OSStatsInterval {
  interval: 'one_day' | 'seven_day' | 'thirty_day';
  volume: number;
  sales: number;
  average_price: number;
}

export interface OSCollectionStats {
  total?: {
    volume: number;
    sales: number;
    average_price: number;
    num_owners: number;
    floor_price: number;
    market_cap: number;
  };
  intervals?: OSStatsInterval[];
}

export interface OSEvent {
  event_type: string; // "sale", "order", "cancel", "transfer", ...
  order_hash?: string;
  chain?: string;
  transaction?: string;
  event_timestamp: number; // unix seconds
  nft?: { identifier?: string; contract?: string };
  payment?: { quantity: string; token_address: string; decimals: number; symbol: string };
  // sale-specific
  seller?: string;
  buyer?: string;
  // order-specific (listings/offers surfaced as events)
  order_type?: string; // "listing" | "collection_offer" | "item_offer" | "trait_offer"
  maker?: string;
  quantity?: number;
}

export interface OSEventsResponse {
  asset_events: OSEvent[];
  next?: string | null;
}

/** A Seaport order item (offer or consideration). */
export interface OSOrderItem {
  itemType: number;
  token: string;
  identifierOrCriteria: string;
  startAmount: string;
  endAmount: string;
  recipient?: string;
}

export interface OSProtocolData {
  parameters: {
    offerer: string;
    offer: OSOrderItem[];
    consideration: OSOrderItem[];
    startTime: string;
    endTime: string;
    orderType?: number;
  };
}

export interface OSListing {
  order_hash: string;
  chain?: string;
  type?: string;
  price?: { current: { currency: string; decimals: number; value: string } };
  protocol_data?: OSProtocolData;
  protocol_address?: string;
}

export interface OSListingsResponse {
  listings: OSListing[];
  next?: string | null;
}

export interface OSOffer {
  order_hash: string;
  chain?: string;
  criteria?: { collection?: { slug?: string }; trait?: unknown };
  price?: { currency: string; decimals: number; value: string };
  protocol_data?: OSProtocolData;
  protocol_address?: string;
}

export interface OSOffersResponse {
  offers: OSOffer[];
  next?: string | null;
}
