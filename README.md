# OpenSea NFT WETH Spread & Liquidity Scanner

A quantitative **market-making intelligence engine** for OpenSea NFT collections.
It answers one question:

> **If I have 1 WETH right now, which collection is the best risk-adjusted place to
> deploy it into a below-market offer?**

It is **not** a floor-price dashboard. It ranks collections by *risk-adjusted
expected return on deployed WETH capital* — combining real trading volume, active
WETH bidding, evidence that sellers actually accept offers, listing/bid depth, a
realistic short-term resale price, an executable spread net of all costs, and
fill/exit probabilities.

> ⚠️ **V1 is analysis + simulation only.** It never signs orders, never custodies
> keys, and never deploys real WETH. A `SimulationExecutionEngine` proves whether
> the strategy has an edge first; a real execution engine can be added later
> behind the same interface.

---

## Quick start

```bash
npm install
cp .env.example .env          # set DATABASE_URL (and OPENSEA_API_KEY for live scans)
npm run db:migrate            # create the schema
npm run db:seed               # load synthetic data so everything works offline
npm run dev                   # http://localhost:3000
```

The seed generates six realistic market archetypes (healthy/liquid, high
accepted-bid, dead-with-giant-spread, falling-floor, thin/fake-floor,
high-volume/low-tx) with a 7-day sales history and snapshot timeline, so the
dashboard, collection pages, paper portfolio and backtester are all populated
**without** an OpenSea API key.

To ingest live data, set `OPENSEA_API_KEY` in `.env` and either click **Run live
scan** on the dashboard or run:

```bash
npm run scan                  # one discover → ingest → snapshot → rank cycle
npm run backtest -- --days=7  # backtest against stored snapshots
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Vitest unit suite (calculation core, parsers, sim engine) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (`next lint`) |
| `npm run db:migrate` / `db:deploy` | Prisma migrations (dev / prod) |
| `npm run db:seed` | Load synthetic data |
| `npm run scan` | Live scan cycle (needs `OPENSEA_API_KEY`) |
| `npm run backtest` | CLI backtest |

## Dashboard

- **Opportunities** — sortable/filterable terminal table ranked by opportunity
  score; every metric column (spread, ROI, P(fill), P(exit), capital efficiency…)
  is sortable.
- **Drops / Mints** — Ethereum-only mint discovery with Upcoming / Featured /
  Recently Minted tabs, live mint countdowns, and scanner-enriched cards. See the
  drops note in [`docs/OPENSEA_API.md`](docs/OPENSEA_API.md).
- **Collection detail** — headline metrics, an explainable *"why this ranks"*
  breakdown, risk penalties, score components, and recent sales/listings/offers.
- **Paper Portfolio** — simulated positions, P&L, win rate, profit-per-WETH-hour.
- **Backtest** — snapshot-driven historical simulation with configurable capital,
  allocation caps, and thresholds.
- **Diagnostics** — OpenSea API health, ingest counts, and a live log feed.

## How it decides (the short version)

```
volume + tx count        ─┐
WETH bid book depth       ─┤
accepted-offer evidence   ─┼─▶ realistic exit ─▶ recommended bid ─▶ net spread
listing/floor depth       ─┤        │                  │               │
sales velocity + trend    ─┘        └── fill prob ──────┴── exit prob ──┴─▶ score (0-100)
                                              └────────── capital efficiency ─────────┘
```

The headline `floor − bestBid` spread is deliberately **not** the ranking metric —
it is a mirage in illiquid collections. See [`docs/STRATEGY.md`](docs/STRATEGY.md)
and [`docs/SCORING.md`](docs/SCORING.md).

## Tech stack

TypeScript (strict) · Next.js 14 (App Router) · React · PostgreSQL · Prisma ·
Vitest · Tailwind. Redis/BullMQ are optional and not required for V1. All secrets
(`OPENSEA_API_KEY`, DB URL) are server-side only.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — modules & data flow
- [`docs/OPENSEA_API.md`](docs/OPENSEA_API.md) — verified endpoints & parsing
- [`docs/STRATEGY.md`](docs/STRATEGY.md) — the trading strategy
- [`docs/SCORING.md`](docs/SCORING.md) — scoring model & risk penalties
- [`docs/DATABASE.md`](docs/DATABASE.md) — schema
- [`docs/BACKTESTING.md`](docs/BACKTESTING.md) — fill/exit model & metrics
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — deploying to Render/Railway/Vercel/Supabase

## Safety & limitations

Estimated profit is **not** guaranteed profit. The scanner explicitly models and
penalises fake spreads, stale/manipulated orders, thin liquidity, falling floors,
wash-trading patterns, single-sale distortion, fees, gas and slippage — but real
markets move and real execution differs. This is a research tool.
