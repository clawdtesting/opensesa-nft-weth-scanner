# OpenSea API Integration

This document details the integration with the OpenSea API (v2) for the NFT WETH Scan application.

## Authentication

All requests require an API key passed in the header:

```
X-API-KEY: <your_api_key>
```

Obtain an API key from https://opensea.io/developers

## Rate Limits

The OpenSea API enforces rate limits. Specific limits are not documented publicly but typically include:

- Default limit: 5 requests per second per IP
- Burst limit: higher for short bursts

Upon exceeding the rate limit, the API returns HTTP 429 (Too Many Requests) with a `Retry-After` header indicating the number of seconds to wait.

Our implementation must:
- Respect the `Retry-After` header
- Implement exponential backoff for retries
- Distribute requests across endpoints to avoid bursting
- Cache immutable data (e.g., collection metadata) to reduce calls

## Pagination

Most list endpoints use cursor-based pagination.

Parameters:
- `limit`: number of items per page (max 50 or 100 depending on endpoint)
- `cursor`: cursor for the next page (from previous response)

Response includes:
- `next`: cursor for the next page (null if no more pages)
- `previous`: cursor for the previous page (if applicable)

We will follow the `next` cursor until it is null to fetch all pages.

## Endpoints Used

### 1. Get Collection Information
**Endpoint:** `GET /api/v2/collections/{slug}`  
**Description:** Retrieves detailed information about a specific NFT collection.  
**Parameters:**
- `slug` (path): The collection slug (e.g., "bayc")
**Response Fields Used:**
- `collection.slug`
- `collection.name`
- `collection.description`
- `collection.image_url`
- `collection.opensea_url`
- `collection.twitter_username`
- `collection.discord_url`
- `collection.created_date`
- `collection.total_supply`
- `collection.average_price` (if needed)
- `collection.floor_price` (note: floor price may be stale; we compute our own from listings)
- `collection.payment_tokens` (array of tokens; we need WETH)

### 2. Get Collection Stats
**Endpoint:** `GET /api/v2/collections/{slug}/stats`  
**Description:** Provides aggregated statistics for the collection.  
**Parameters:**
- `slug` (path)
**Response Fields Used:**
- `stats.total_volume` (all time)
- `stats.total_sales` (all time)
- `stats.num_owners`
- `stats.average_price` (recent)
- `stats.num_reported_sales` (for period)
- `stats.market_cap` (if available)
- `stats.floor_price` (again, we may compute our own)

### 3. Get Collection Events (Sales, Listings, Offers)
**Endpoint:** `GET /api/v2/events`  
**Description:** Fetches events (sales, listings, offers, transfers, etc.) for a collection or asset contract.  
**Parameters:**
- `collection_contract_address` (query): The NFT contract address
- `event_type` (query): Comma-separated list of event types (e.g., `sale`, `created`, `cancelled`, `offer_entered`, `offer_withdrawn`, `bid_entered`, `bid_withdrawn`)
- `occurred_after` (query): Unix timestamp for start of window
- `occurred_before` (query): Unix timestamp for end of window
- `limit` (query): Page size
- `cursor` (query): Pagination cursor
**Response Fields Used:**
- `asset_contract.address`
- `asset_contract.name`
- `asset_contract.symbol`
- `event_type`
- `event_timestamp`
- `payment_token.symbol` (e.g., WETH, ETH, USDC)
- `payment_token.decimals`
- `payment_token.address` (contract address of the token)
- `total_price` (in wei of the payment token)
- `winner_account.address` (buyer)
- `seller.address` (seller)
- `maker` (for offers)
- `taker` (for offers)
- `quantity` (number of items)
- `auction_type` (for auctions)
- `current_price` (for Dutch auctions)

### 4. Get Listings (Asks) for a Collection
**Endpoint:** `GET /api/v2/listings/collection/{slug}/all`  
**Description:** Retrieves all active listings (asks) for a collection.  
**Alternative:** `GET /api/v2/orders/{chain}/{protocol}/listings` with collection filter.  
**Parameters:**
- `slug` (path)
- `limit` (query)
- `cursor` (query)
**Response Fields Used:**
- `protocol_data` (parameters for Seaport)
- `consideration` (array of items offered as payment)
- `offerer` (seller address)
- `receiver` (buyer address, usually zero address for listings)
- `start_time`
- `end_time`
- `list_time`
- `protocol` (should be 1 for Seaport)
- `side` (1 for sell, 0 for buy? need to check)
- `base_price` (in wei of the token)

### 5. Get Offers (Bids) for a Collection
**Endpoint:** `GET /api/v2/offers/collection/{slug}`  
**Description:** Retrieves collection-wide offers (bids on any token in the collection).  
**Parameters:**
- `slug` (path)
- `limit` (query)
- `cursor` (query)
**Response Fields Used:**
- Similar to listings but reversed: offerer is buyer, receiver is seller (or collection?).
- `price` (in wei of the token)
- `token_set` (defines which tokens the bid applies to; for collection offers, it's the whole collection)
- `expiration_time`

### 6. Get Token Attributes (for trait-based analysis, optional)
**Endpoint:** `GET /api/v2/collections/{slug}/traits`  
**Description:** Returns trait statistics for the collection.  
**Parameters:**
- `slug` (path)
**Response Fields Used:**
- `trait_type`
- `value`
- `count` (number of NFTs with this trait)
- `floor_price` (floor price for this trait)

## Data Models

### Collection
Represents an NFT collection (e.g., BAYC).

### Event
Represents a blockchain event (sale, listing, offer, transfer).

### Listing (Ask)
Represents a sell order.

### Offer (Bid)
Represents a buy order.

### Payment Token
Represents an ERC20 token used for payment (e.g., WETH, USDC, DAI).

## Implementation Notes

- We will map the `payment_token.address` to known tokens (WETH, etc.) using a lookup table.
- All monetary values from the API are in wei (smallest unit) of the payment token; we will convert to ether for display.
- Timestamps are in ISO 8601 format or Unix seconds; we will standardize to Unix seconds.
- We will deduplicate events using a combination of transaction hash and log index (if provided) or by using the event's unique identifier if available (e.g., `id` field in some responses).
- For listings and offers, we will consider only those with valid `end_time` in the future or no expiration.

## Error Handling

- Handle HTTP 429 with retry-after.
- Handle HTTP 5xx with exponential backoff.
- Log errors and continue processing other collections if one fails.
- Validate incoming data; discard malformed entries.

## Example Flow

1. Discover collections via `/api/v2/collections` (sorted by volume or sales) or use a predefined list.
2. For each collection:
   a. Fetch basic info and stats.
   b. Fetch recent events (last 24h) for sales, listings, offers.
   c. Fetch current listings and offers.
   d. Compute metrics: sales volume, average price, floor price from listings, bid depth, ask depth, etc.
   e. Store snapshot in database.
3. After processing all collections, compute opportunity scores.
4. Serve data via API to frontend.

## References

- Official OpenSea API docs: https://docs.opensea.io/reference
- Seaport documentation: https://github.com/ProjectOpenSea/seaport