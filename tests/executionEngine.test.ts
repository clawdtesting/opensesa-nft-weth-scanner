import { describe, it, expect } from 'vitest';
import { SimulationExecutionEngine, getExecutionEngine } from '@/lib/sim/executionEngine';
import type { SaleRecord } from '@/domain/types';

describe('SimulationExecutionEngine', () => {
  it('never claims real execution', async () => {
    const engine = getExecutionEngine();
    const created = await engine.createOffer({ collectionSlug: 'x', bidEth: 0.7 });
    expect(created.simulated).toBe(true);
    const cancelled = await engine.cancelOffer(created.offerId);
    expect(cancelled.simulated).toBe(true);
  });

  it('reports whether an offer would have filled from observed sales', () => {
    const engine = new SimulationExecutionEngine();
    const t0 = new Date('2026-01-10T00:00:00Z');
    const sales: SaleRecord[] = [
      {
        tokenId: '1',
        priceEth: 0.68,
        currency: 'WETH',
        buyer: '0xb',
        seller: '0xs',
        fromAcceptedOffer: true,
        floorAtSale: 1,
        timestamp: new Date(t0.getTime() + 3_600_000),
      },
    ];
    expect(engine.wouldFill(0.7, t0, sales, 24).filled).toBe(true);
    expect(engine.wouldFill(0.6, t0, sales, 24).filled).toBe(false);
  });
});
