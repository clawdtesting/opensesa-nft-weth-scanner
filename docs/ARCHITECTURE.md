# Architecture

## Stack

- **Next.js 14 (App Router)** — server components render the dashboard directly
  from services; API routes expose the same capabilities programmatically.
- **TypeScript (strict)** with `noUncheckedIndexedAccess`.
- **PostgreSQL + Prisma** for persistence.
- **Vitest** for the unit suite; **Tailwind** for the terminal-style UI.
- Redis/BullMQ are *optional* and not required for V1.

## Layered design

```
src/
├─ config/            strategy.ts (all tunables), env.ts (server-only secrets)
├─ domain/            types.ts (data shapes), analyze.ts (pure orchestration)
├─ lib/
│  ├─ calc/           PURE calculation core — one concern per file:
│  │                    velocity · bidbook · floorbook · acceptedOffers ·
│  │                    exit · bid · spread · probability · capitalEfficiency · score
│  ├─ opensea/        client · rateLimiter · types · parse  (API integration)
│  ├─ sim/            simengine (fill/exit models) · fixtures (archetypes)
│  ├─ math.ts money.ts logger.ts db.ts
├─ services/          discovery · ingestion · snapshot · scan · opportunities ·
│                     papertrading · backtest   (compose calc + DB + API)
├─ app/               Next.js routes (pages + /api)
├─ components/        client React components (tables, runners)
└─ scripts/           scan.ts · backtest.ts   (CLI entry points)
```

**Key boundary:** everything in `lib/calc`, `lib/sim`, `domain/analyze`, and
`config/strategy` is **pure and deterministic** — no I/O, no `server-only`. That
is what makes the strategy fully unit-testable (see `tests/`) and lets the *same*
code run in the live pipeline, the seed, and the backtester.

Anything touching secrets or the database (`config/env`, `lib/db`, `lib/opensea`,
all `services/*`) imports `server-only` so it can never leak into a client bundle.

## Data flow (a scan cycle)

```
discoverCollections ──▶ ingestCollection ──▶ buildSnapshot ──▶ rerankOpportunities
   (top volume +          (events/listings/     (analyzeCollection →      (assign ranks)
    seed slugs,            offers, dedup,         MarketSnapshot +
    cheap filter)          persist)               Opportunity)
                                                        │
                                                        ▼
                                                 recordPaperTrades
                                                 (SimulationExecutionEngine)
```

`runScan` (`services/scan.ts`) sequences this and is safe to run repeatedly (cron,
interval, the dashboard button, or `npm run scan`). Per-collection failures are
isolated.

## Read path (dashboard)

Server components call `listOpportunities` / `getCollectionDetail` /
`getPaperPortfolio` directly (no internal HTTP hop). The same data is available at
`/api/opportunities`, `/api/diagnostics`, etc. for external consumers.

## Execution abstraction

V1 ships only a **simulation** engine (`lib/sim/simengine.ts`, wired via
`services/papertrading.ts`). A future real `ExecutionEngine`
(`createOffer`/`cancelOffer`) can implement the same seam without touching the
analysis layer. No private keys, no signing, no fund custody in V1.

## Security

- `OPENSEA_API_KEY` and `DATABASE_URL` are server-only; never `NEXT_PUBLIC_*`.
- The client bundle contains only rendered data, never credentials.
- Rate limiting + caching protect the API budget.
