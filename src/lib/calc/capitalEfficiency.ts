export interface CapitalEfficiencyInputs {
  expectedProfit: number | null;
  fillProbability: number;
  exitProbability: number;
  capitalRequired: number | null;
  expectedHoldingHours: number;
}

/**
 * Capital efficiency — the primary product metric.
 *
 *   expectedProfit × P(fill) × P(exit)
 *   ──────────────────────────────────
 *      capital × expectedHoldingHours
 *
 * Interpreted as "risk-adjusted expected profit per WETH per hour". This is what
 * answers: if I have 1 WETH right now, where should it go? Returns null when the
 * inputs can't support a meaningful figure (no capital / no profit estimate).
 */
export function computeCapitalEfficiency(inputs: CapitalEfficiencyInputs): number | null {
  const { expectedProfit, fillProbability, exitProbability, capitalRequired, expectedHoldingHours } =
    inputs;
  if (
    expectedProfit === null ||
    capitalRequired === null ||
    capitalRequired <= 0 ||
    expectedHoldingHours <= 0
  ) {
    return null;
  }
  const riskAdjusted = expectedProfit * fillProbability * exitProbability;
  return riskAdjusted / (capitalRequired * expectedHoldingHours);
}
