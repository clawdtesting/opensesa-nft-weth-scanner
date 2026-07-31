import { describe, it, expect } from 'vitest';
import { evaluateFill, evaluateExit } from '@/lib/sim/simengine';
import { DEFAULT_STRATEGY } from '@/config/strategy';
import type { SaleRecord } from '@/domain/types';

const T0 = new Date('2026-01-10T00:00:00Z');
const HOUR = 3_600_000;

function s(priceEth: number, ageHoursFromT0: number, accepted: boolean): SaleRecord {
  return {
    tokenId: 't',
    priceEth,
    currency: accepted ? 'WETH' : 'ETH',
    buyer: '0xb',
    seller: '0xs',
    fromAcceptedOffer: accepted,
    floorAtSale: null,
    timestamp: new Date(T0.getTime() + ageHoursFromT0 * HOUR),
  };
}

describe('evaluateFill', () => {
  it('fills at the first accepted-offer sale at or below the bid', () => {
    const sales = [s(0.9, 1, true), s(0.7, 2, true), s(0.65, 3, true)];
    const fill = evaluateFill(0.72, T0, sales, 24);
    expect(fill.filled).toBe(true);
    expect(fill.fillEth).toBe(0.72);
    expect(fill.filledAt?.getTime()).toBe(sales[1]!.timestamp.getTime());
  });

  it('does not fill when no seller accepts at or below the bid', () => {
    const sales = [s(0.9, 1, true), s(0.85, 2, true)];
    const fill = evaluateFill(0.72, T0, sales, 24);
    expect(fill.filled).toBe(false);
  });

  it('ignores non-accepted (listing) sales as fill evidence', () => {
    const sales = [s(0.7, 1, false)];
    const fill = evaluateFill(0.72, T0, sales, 24);
    expect(fill.filled).toBe(false);
  });

  it('respects the fill window', () => {
    const sales = [s(0.7, 48, true)];
    expect(evaluateFill(0.72, T0, sales, 24).filled).toBe(false);
    expect(evaluateFill(0.72, T0, sales, 72).filled).toBe(true);
  });
});

describe('evaluateExit', () => {
  const filledAt = new Date(T0.getTime() + 2 * HOUR);

  it('sells at target when a buyer clears at or above it, netting fees/gas', () => {
    const sales = [s(0.95, 5, false), s(1.0, 8, false)];
    const exit = evaluateExit({
      entry: 0.72,
      target: 0.94,
      filledAt,
      subsequentSales: sales,
      maxHoldHours: 168,
      fees: DEFAULT_STRATEGY.fees,
      marketplaceFeeBps: 250,
      creatorFeeBps: 50,
    });
    expect(exit.exitEth).toBe(0.94);
    // net = 0.94 - 0.72 - fees(3% of 0.94) - gas
    const fees = 0.94 * 0.03;
    expect(exit.netProfit).toBeCloseTo(0.94 - 0.72 - fees - DEFAULT_STRATEGY.fees.gasEstimateEth, 6);
    expect(exit.roi).toBeGreaterThan(0);
  });

  it('forces a mark-to-market close when no buyer reaches target', () => {
    const sales = [s(0.8, 5, false), s(0.82, 10, false)];
    const exit = evaluateExit({
      entry: 0.72,
      target: 1.5,
      filledAt,
      subsequentSales: sales,
      maxHoldHours: 24,
      fees: DEFAULT_STRATEGY.fees,
      marketplaceFeeBps: 250,
      creatorFeeBps: 50,
      fallbackPrice: 0.75,
    });
    expect(exit.reason).toContain('marked to market');
    expect(exit.exitEth).toBe(0.82); // last observed sale within window
  });
});
