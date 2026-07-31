# Opportunity Scoring

Implemented in `src/lib/calc/score.ts` (`computeOpportunityScore`) and configured
via `src/config/strategy.ts`. The score is a **0–100 relative ranking of
risk-adjusted edge** — not a probability and not a promise of profit.

```
score = Σ (componentᵢ · weightᵢ)  −  Σ risk penalties        (clamped to 0…100)
```

Every component, weighted contribution, penalty and a human-readable `reason` are
returned and persisted in `MarketSnapshot.scoreDetail`, then rendered on the
collection page — the number is always auditable.

## Components (each normalised to 0–100)

| Component | Weight | Definition |
| --- | --- | --- |
| Liquidity | 25% | Mean of log-scaled 24h volume and 24h sales count. Transaction count matters as much as raw volume. |
| Executable spread | 20% | `expectedRoi` (net of fees/gas/risk) scaled against `norms.spreadFullScore`. |
| Accepted-bid activity | 15% | 60% accepted-offers-24h count + 40% median seller concession. |
| Fill probability | 15% | `fillProbability × 100` (see `probability.ts`). |
| Exit probability | 10% | `exitProbability24h × 100`. |
| Floor structure | 5% | Inverse of the floor-wall ratio — a thin wall relative to sales is healthy. |
| Momentum | 5% | Short-term price trend mapped from [-1,1] to [0,100]. |
| Capital efficiency | 5% | Log-scaled risk-adjusted profit per WETH-hour. |

Weights live in `scoreWeights` and normalisation ceilings in `norms`; both are
overridable per `StrategyConfiguration`.

## Risk penalties

Subtracted after the weighted sum (`score.ts`):

| Penalty | Points | Trigger |
| --- | --- | --- |
| No sales in 6h | 10 | `sales6h === 0` |
| Very low tx count | 10 | `sales24h < 5` |
| Rapidly falling floor | 15 | 6h floor drop > `maxFloorDrop6h` |
| Large floor wall | 8 | `floorWallRatio > 5` |
| Extremely thin bidding | 5 | single lone offer |
| Extreme bid concentration | 5 | `bidDepth1 ≥ 8` |
| Single-sale volume distortion | 8 | `mean/median sale > 3` |
| Possible fake floor | 6 | only one listing within 10% of floor |

These are exactly what make the scanner reject a **dead collection with a giant
headline spread**: it can have an 85% `floor − bestBid` gap yet score ~0 because
it has no sales, no accepted offers, and negligible executable ROI after costs.

## Filters (pass/fail, separate from score)

`passesFilters` (`src/domain/analyze.ts`) applies the `StrategyFilters` minimums
(sales, volume, accepted offers, raw spread, expected ROI, max floor drop, min
score). An opportunity can appear in the table but be marked "filtered" if it
fails these — the dashboard can hide non-passing rows.

## Worked example (from seed data)

The *Healthy Liquid* archetype: 40 sales/24h, 14 accepted offers, 28% raw spread,
~30% executable ROI, thin floor wall, slight positive momentum → **~82/100,
passes**. The *Dead / Giant Spread* archetype: 1 old sale, huge raw spread →
**~0/100, filtered**.

See `tests/score.test.ts` and `tests/analyze.test.ts` for executable
specifications of every rule above.
