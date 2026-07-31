import { describe, it, expect } from 'vitest';
import { computeVelocity, shortTermTrend } from '@/lib/calc/velocity';
import type { SaleRecord } from '@/domain/types';

const NOW = new Date('2026-01-10T12:00:00Z');
const HOUR = 3_600_000;

function s(priceEth: number, ageHours: number, extra: Partial<SaleRecord> = {}): SaleRecord {
  return {
    tokenId: 't',
    priceEth,
    currency: 'ETH',
    buyer: extra.buyer ?? `0xb${ageHours}`,
    seller: extra.seller ?? `0xs${ageHours}`,
    fromAcceptedOffer: extra.fromAcceptedOffer ?? false,
    floorAtSale: extra.floorAtSale ?? null,
    timestamp: new Date(NOW.getTime() - ageHours * HOUR),
  };
}

describe('computeVelocity', () => {
  it('buckets sales by window and counts transactions independently of volume', () => {
    const sales = [s(1, 0.5), s(1, 2), s(1, 5), s(1, 20), s(1, 30 * 24)];
    const v = computeVelocity(sales, NOW);
    expect(v.sales1h).toBe(1);
    expect(v.sales6h).toBe(3);
    expect(v.sales24h).toBe(4);
    expect(v.sales7d).toBe(4); // the 30-day-old sale is outside 7d
    expect(v.volume24h).toBe(4);
  });

  it('counts unique buyers and sellers in 24h', () => {
    const sales = [
      s(1, 1, { buyer: '0xA', seller: '0xX' }),
      s(1, 2, { buyer: '0xA', seller: '0xY' }),
      s(1, 3, { buyer: '0xB', seller: '0xY' }),
    ];
    const v = computeVelocity(sales, NOW);
    expect(v.uniqueBuyers24h).toBe(2);
    expect(v.uniqueSellers24h).toBe(2);
  });

  it('reports last sale', () => {
    const sales = [s(2, 5), s(3, 0.1)];
    const v = computeVelocity(sales, NOW);
    expect(v.lastSalePrice).toBe(3);
  });

  it('handles empty input', () => {
    const v = computeVelocity([], NOW);
    expect(v.sales24h).toBe(0);
    expect(v.medianSale24h).toBeNull();
    expect(v.lastSalePrice).toBeNull();
  });
});

describe('shortTermTrend', () => {
  it('is positive when recent prices exceed prior window', () => {
    const sales = [s(1.2, 1), s(1.2, 2), s(1.0, 12), s(1.0, 18)];
    expect(shortTermTrend(sales, NOW)).toBeGreaterThan(0);
  });

  it('is negative when recent prices fall', () => {
    const sales = [s(0.8, 1), s(0.8, 2), s(1.0, 12), s(1.0, 18)];
    expect(shortTermTrend(sales, NOW)).toBeLessThan(0);
  });

  it('is zero without both windows', () => {
    expect(shortTermTrend([s(1, 1)], NOW)).toBe(0);
  });
});
