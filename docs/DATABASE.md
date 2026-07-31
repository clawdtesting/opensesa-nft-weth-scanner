# Database Schema

Defined in `prisma/schema.prisma` (PostgreSQL). Monetary values are stored as
`Float` in whole token units (ETH/WETH) — used for analysis/display only, never
for signing. Run `npm run db:migrate` to create the schema, `npm run db:seed` to
populate synthetic data.

## Models

### `Collection`
Reference data for a monitored collection: `slug` (unique), `chain`, `contract`,
`name`, `totalSupply`, `imageUrl`, `openseaUrl`, `marketplaceFeeBps`,
`creatorFeeBps`, plus `discovered` / `active` flags set by discovery's cheap
filter. Indexed on `(chain, active)` and `updatedAt`.

### `Sale`
An ingested sale. `eventId` is `@unique` for deterministic dedup.
`fromAcceptedOffer` marks WETH-settled sales (the accepted-offer signal);
`floorAtSale` records the floor at sale time to derive seller concession. Indexed
on `(collectionId, timestamp)` and `(collectionId, fromAcceptedOffer, timestamp)`.

### `Listing`
Active asks (`orderHash` unique, `priceEth`, `endTime`, `active`). The ingestion
step deactivates the prior book and rewrites the current one. Indexed on
`(collectionId, active, priceEth)`.

### `Offer`
Collection/token/trait WETH bids (`orderHash` unique, per-item `priceEth`,
`quantity`, `offerType`, `expiration`, `active`). `OfferType` enum:
`COLLECTION | TOKEN | TRAIT`. Indexed on `(collectionId, active, offerType, priceEth)`.

### `MarketSnapshot`
The historical backbone — one row per collection per scan. Stores floor, realistic
exit + confidence, top-3 bids, sales/volume across 1h/6h/24h/7d, unique
buyers/sellers, accepted-offer counts + median concession, floor depth
(1/2/5/10%), bid depth (1/2/5/10%), recommended bid, expected profit/ROI,
fill/exit probabilities, estimated holding hours, capital efficiency, `score`, and
a `scoreDetail` JSON blob (components, penalties, reason, exit/bid explanations).
Indexed on `(collectionId, timestamp)` and `timestamp`. **Snapshots are what make
backtesting possible** — they capture what the strategy saw *before* each sale.

### `Opportunity`
Denormalised latest opportunity per collection (`collectionId` unique) for fast
dashboard reads: `score`, `rank`, `passesFilter`, `reason`, `detail`. Indexed on
`score`.

### `SimulatedOrder` / `SimulatedPosition`
Paper-trading + backtest records. `SimulatedOrder` (status
`OPEN|FILLED|CANCELLED|EXPIRED`) has an optional `runId` grouping a backtest run
(null = live paper trading). `SimulatedPosition` (status `OPEN|CLOSED`) tracks
entry/exit, gross/net profit, fees, gas, ROI and holding hours.

### `StrategyConfiguration`
Named, versioned strategy configs stored as JSON (`isDefault` marks the active
one). Lets thresholds/weights be edited without code changes; the snapshot service
loads the default row and falls back to `DEFAULT_STRATEGY`.

## Design notes

- **Deterministic identities** (`Sale.eventId`, `*.orderHash` unique) make
  ingestion idempotent.
- **Cascade deletes** from `Collection` keep the graph consistent.
- Indexes target the hot paths: ranking by score, time-windowed sales queries, and
  active-book lookups.
