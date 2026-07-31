# Backtesting

Implemented in `src/services/backtest.ts` (`runBacktest`). It is **snapshot-driven
and evidence-based**: signals come from what the strategy *saw* (stored
`MarketSnapshot`s), and fills/exits are resolved against the *actual* `Sale`
records that followed — using the shared, deterministic engine in
`src/lib/sim/simengine.ts`. No randomness, so runs are reproducible.

## Why snapshots

You cannot honestly backtest "would this bid have filled?" from current state
alone. Every scan writes a snapshot capturing floor, bids, realistic exit,
recommended bid, score, ROI, etc. at that moment. The backtester replays those
snapshots as the signals that would have fired.

## The models (shared with live paper trading)

**Fill** (`evaluateFill`): a WETH offer at `bid` fills the first time a seller is
observed accepting an offer **at or below** the bid — i.e. an accepted-offer sale
(`fromAcceptedOffer`, WETH-settled) priced `≤ bid` occurs within the fill window.
Listing sales are *not* fill evidence.

**Exit** (`evaluateExit`): after filling at `entry`, we list at `target` (the
snapshot's realistic exit) and exit the first time a buyer clears **at or above**
target within `maxHoldHours`. If none appears, we force a mark-to-market close at
the last observed sale (realistically modelling being stuck). Net profit subtracts
marketplace fee + creator royalty (on exit proceeds) + gas.

## Capital model

Signals are processed chronologically. Capital is committed on fill and released
(with proceeds) at the modelled exit time, subject to:

- `startingCapitalEth`
- `maxAllocationPerCollectionEth` (concentration cap)
- `maxConcurrentPositions`
- `minScore`, `minExpectedRoi` thresholds

An equity curve is tracked to compute **max drawdown**.

## Configuration

| Field | Meaning |
| --- | --- |
| `start` / `end` | Backtest window |
| `startingCapitalEth` | Initial WETH |
| `maxAllocationPerCollectionEth` | Per-collection cap |
| `maxConcurrentPositions` | Concurrency limit |
| `minScore` / `minExpectedRoi` | Signal thresholds |
| `fillWindowHours` | How long an offer stays live |
| `maxHoldHours` | Max hold before forced exit |

## Output metrics

Opportunities detected, orders simulated, fills, **fill rate**, positions exited,
gross P&L, fees, **net P&L**, ROI, **win/loss rate**, **max drawdown**, average &
median holding hours, **profit per WETH-hour**, final equity, a **per-collection**
breakdown, and the full trade list.

## Running

- UI: **Backtest** page.
- API: `POST /api/backtest` with a JSON config.
- CLI: `npm run backtest -- --days=7 --capital=10 --minScore=60 --minRoi=0.05`

Requires a snapshot history — use `npm run db:seed` (ships a 3-day snapshot
timeline) or accumulate live scans.

## Roadmap

The transparent heuristic fill/exit models are intentionally simple for V1 so
results are explainable. Natural extensions: order-book-depth-aware fills,
partial fills, and probability-weighted (Monte Carlo) exits validated against the
heuristic probabilities in `probability.ts`.
