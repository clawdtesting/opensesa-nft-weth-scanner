# OpenSea API Integration

This documents the **OpenSea API v2** integration as actually implemented in
`src/lib/opensea/`. Endpoints were verified against OpenSea's current developer
documentation and the official `opensea-js` SDK reference (Jan 2026); do not copy
older v1 examples.

- **Base URL:** `https://api.opensea.io/api/v2` (override via `OPENSEA_API_BASE`)
- **Client:** `src/lib/opensea/client.ts` (`OpenSeaClient`)
- **Wire types:** `src/lib/opensea/types.ts`
- **Normalisers:** `src/lib/opensea/parse.ts`

## Authentication

Every request sends the API key in a header. **The key is server-side only** —
it is read from `process.env.OPENSEA_API_KEY` inside modules guarded by
`import 'server-only'` and is never exposed to the client bundle.

```
X-API-KEY: <OPENSEA_API_KEY>
Accept: application/json
```

Get a key: <https://docs.opensea.io/reference/api-keys>

## Rate limits, retries & caching

Treated as a first-class engineering constraint (`RateLimiter`,
`src/lib/opensea/rateLimiter.ts`):

- **Client-side token bucket** throttles to `OPENSEA_MAX_RPS` (default 4/s, close
  to OpenSea's documented default budget).
- **429 handling** honours the `Retry-After` header, then exponential backoff.
- **5xx / network errors** retry with capped exponential backoff (up to 5 attempts).
- **Caching** with per-endpoint TTLs (immutable-ish data cached longest):
  collection metadata 60 min, stats 60 s, discovery list 5 min, events/orders
  uncached (fast-moving).
- **Request de-duplication:** concurrent identical requests share one in-flight
  promise.
- **Health metrics** (`client.metrics`) are surfaced on the Diagnostics page.

## Endpoints used

| Purpose | Method & path | Notes |
| --- | --- | --- |
| Discover collections | `GET /collections?chain={chain}&order_by=seven_day_volume&limit=100&next=` | Cursor pagination via `next`. |
| Collection metadata + fees | `GET /collections/{slug}` | Fees split into marketplace vs creator. |
| Collection stats | `GET /collections/{slug}/stats` | `intervals[one_day]` used for the cheap discovery filter. |
| Events (sales) | `GET /events/collection/{slug}?event_type=sale&after={unix}&before={unix}&limit=50&next=` | 7-day sales window; `next` cursor. |
| Cheapest listings | `GET /listings/collection/{slug}/best?limit=100&next=` | Floor-depth analysis. |
| Collection offers | `GET /offers/collection/{slug}?limit=100&next=` | Collection-wide WETH bids. |

Pagination helpers (`collectEvents`, `collectBestListings`,
`collectCollectionOffers`) follow the `next` cursor up to a bounded page count.

## How the wire format is normalised

`parse.ts` converts raw responses into the domain records in
`src/domain/types.ts`.

### Money

All order/consideration amounts arrive as **integer wei strings**. `weiToEth`
(`src/lib/money.ts`) converts to whole tokens. These numbers are used only for
analysis and display — never to sign transactions — so `number` precision is
ample.

### ETH vs WETH — the accepted-offer signal

- A **listing purchase** settles in **ETH**.
- An **accepted offer/bid** settles in **WETH** (ETH cannot be escrowed for a bid).

So `parseSaleEvent` flags any WETH-settled sale as `fromAcceptedOffer = true`.
This is the most reliable accepted-offer signal available without tracing Seaport
fulfilment on-chain, and it drives the seller-concession analytics. Known WETH
contract addresses per chain are listed in `parse.ts`.

### Collection offer prices are per-item

OpenSea prices a collection offer as the **total for `quantity` items**.
`parseOffer` reads the quantity from the Seaport consideration and normalises to a
**per-item** WETH price so bids are directly comparable to floor and listing
prices.

### Fees

`parseFees` splits the `fees[]` array: the OpenSea fee recipient becomes the
marketplace fee; all other recipients are summed into the creator royalty (which
also applies to offer settlement). Falls back to 2.5% marketplace / 0% creator.

## Event deduplication

Sales are stored with a deterministic `eventId` (`saleEventId`): transaction hash
+ token id when present, else order hash, else a composite of
contract/token/timestamp. The `Sale.eventId` column is `@unique`, so re-ingesting
the same window is idempotent.

## Error handling

- One failing collection never aborts a scan cycle (`runScan` isolates per-slug
  failures and logs them).
- Malformed entries (missing/zero price, unparseable payloads) are discarded.
- All API activity is logged to the in-memory ring buffer shown on Diagnostics.

## References

- OpenSea API reference: <https://docs.opensea.io/reference>
- `opensea-js` SDK API reference:
  <https://github.com/ProjectOpenSea/opensea-js/blob/main/developerDocs/api-reference.md>
- Seaport: <https://github.com/ProjectOpenSea/seaport>
