/**
 * Execution abstraction.
 *
 * V1 ships ONLY `SimulationExecutionEngine`. A real, on-chain engine can later
 * implement the same `ExecutionEngine` interface without touching the analysis
 * or ranking layers — but V1 must never sign orders, custody keys, or deploy real
 * WETH. The goal of V1 is to prove the strategy has an edge via paper trading and
 * backtesting first.
 */
import { evaluateFill, type FillOutcome } from './simengine';
import type { SaleRecord } from '@/domain/types';

export interface CreateOfferParams {
  collectionSlug: string;
  bidEth: number;
  quantity?: number;
  expirationHours?: number;
}

export interface CreateOfferResult {
  offerId: string;
  simulated: boolean;
}

export interface ExecutionEngine {
  /** Place a (collection) WETH offer. */
  createOffer(params: CreateOfferParams): Promise<CreateOfferResult>;
  /** Cancel a previously created offer. */
  cancelOffer(offerId: string): Promise<{ cancelled: boolean; simulated: boolean }>;
}

/**
 * The only engine wired up in V1. It never touches a wallet — it records intent
 * and, given observed sales, can report whether an offer *would* have filled
 * using the shared simulation model.
 */
export class SimulationExecutionEngine implements ExecutionEngine {
  private counter = 0;

  async createOffer(params: CreateOfferParams): Promise<CreateOfferResult> {
    this.counter += 1;
    return { offerId: `sim-${params.collectionSlug}-${this.counter}`, simulated: true };
  }

  async cancelOffer(offerId: string): Promise<{ cancelled: boolean; simulated: boolean }> {
    void offerId; // no-op in simulation; real engine would submit a cancel
    return { cancelled: true, simulated: true };
  }

  /** Would an offer at `bidEth` placed at `placedAt` have filled? (paper/backtest helper) */
  wouldFill(
    bidEth: number,
    placedAt: Date,
    subsequentSales: readonly SaleRecord[],
    windowHours = 72,
  ): FillOutcome {
    return evaluateFill(bidEth, placedAt, subsequentSales, windowHours);
  }
}

/** Factory — always returns the simulation engine in V1. */
export function getExecutionEngine(): ExecutionEngine {
  return new SimulationExecutionEngine();
}
