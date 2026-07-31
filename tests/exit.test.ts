import { describe, it, expect } from 'vitest';
import { computeRealisticExit } from '@/lib/calc/exit';
import { DEFAULT_STRATEGY } from '@/config/strategy';
import type { VelocityMetrics, FloorBook } from '@/domain/types';

function velocity(overrides: Partial<VelocityMetrics> = {}): VelocityMetrics {
  return {
    sales1h: 2,
    sales6h: 8,
    sales24h: 20,
    sales7d: 100,
    volume1h: 2,
    volume6h: 8,
    volume24h: 20,
    volume7d: 100,
    uniqueBuyers24h: 10,
    uniqueSellers24h: 10,
    medianSale1h: 0.95,
    medianSale6h: 0.95,
    medianSale24h: 0.95,
    meanSale24h: 0.96,
    lastSalePrice: 0.95,
    lastSaleTimestamp: new Date(),
    ...overrides,
  };
}

function floorBook(overrides: Partial<FloorBook> = {}): FloorBook {
  return {
    floor: 1.0,
    listingCount: 5,
    floorDepth1: 2,
    floorDepth2: 3,
    floorDepth5: 5,
    floorDepth10: 6,
    floorWallRatio: 0.25,
    medianCheapest5: 1.02,
    ...overrides,
  };
}

describe('computeRealisticExit', () => {
  it('does not simply equal the floor', () => {
    const exit = computeRealisticExit(
      { velocity: velocity(), floorBook: floorBook(), trend: 0 },
      DEFAULT_STRATEGY.exitWeights,
    );
    expect(exit.price).not.toBeNull();
    expect(exit.price).not.toBe(1.0);
    // Weighted blend of 0.95 (sales), 1.0 (floor), 1.02 (cheapest) => between.
    expect(exit.price!).toBeGreaterThan(0.95);
    expect(exit.price!).toBeLessThan(1.02);
  });

  it('exposes inputs, weights and an explanation', () => {
    const exit = computeRealisticExit(
      { velocity: velocity(), floorBook: floorBook(), trend: 0.1 },
      DEFAULT_STRATEGY.exitWeights,
    );
    expect(exit.inputs.currentFloor).toBe(1.0);
    expect(exit.weights.medianRecentSales).toBe(0.4);
    expect(exit.explanation).toContain('median recent sales');
    expect(exit.confidence).toBeGreaterThan(0);
  });

  it('applies a positive trend upward and negative downward', () => {
    const up = computeRealisticExit(
      { velocity: velocity(), floorBook: floorBook(), trend: 0.5 },
      DEFAULT_STRATEGY.exitWeights,
    );
    const down = computeRealisticExit(
      { velocity: velocity(), floorBook: floorBook(), trend: -0.5 },
      DEFAULT_STRATEGY.exitWeights,
    );
    expect(up.price!).toBeGreaterThan(down.price!);
  });

  it('renormalises when some anchors are missing', () => {
    const exit = computeRealisticExit(
      {
        velocity: velocity({ medianSale24h: null }),
        floorBook: floorBook({ medianCheapest5: null }),
        trend: 0,
      },
      DEFAULT_STRATEGY.exitWeights,
    );
    // Only the floor anchor remains.
    expect(exit.price).toBeCloseTo(1.0, 5);
  });

  it('returns null with no data', () => {
    const exit = computeRealisticExit(
      { velocity: velocity({ medianSale24h: null }), floorBook: floorBook({ floor: null, medianCheapest5: null }), trend: 0 },
      DEFAULT_STRATEGY.exitWeights,
    );
    expect(exit.price).toBeNull();
    expect(exit.confidence).toBe(0);
  });
});
