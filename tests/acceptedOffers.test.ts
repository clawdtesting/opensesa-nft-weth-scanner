import { describe, it, expect } from 'vitest';
import { computeAcceptedOfferStats, looksLikeAcceptedOffer } from '@/lib/calc/acceptedOffers';
import type { SaleRecord } from '@/domain/types';

const NOW = new Date('2026-01-10T12:00:00Z');
const HOUR = 3_600_000;

function s(priceEth: number, ageHours: number, accepted: boolean, floorAtSale: number | null): SaleRecord {
  return {
    tokenId: 't',
    priceEth,
    currency: accepted ? 'WETH' : 'ETH',
    buyer: '0xb',
    seller: '0xs',
    fromAcceptedOffer: accepted,
    floorAtSale,
    timestamp: new Date(NOW.getTime() - ageHours * HOUR),
  };
}

describe('looksLikeAcceptedOffer', () => {
  it('flags WETH-settled sales as accepted offers', () => {
    expect(looksLikeAcceptedOffer({ currency: 'WETH' })).toBe(true);
    expect(looksLikeAcceptedOffer({ currency: 'ETH' })).toBe(false);
  });
});

describe('computeAcceptedOfferStats', () => {
  it('counts accepted offers per window and computes seller concession', () => {
    const sales = [
      s(0.78, 0.5, true, 1.0), // 22% concession
      s(0.8, 5, true, 1.0), // 20%
      s(0.75, 20, true, 1.0), // 25%
      s(1.0, 2, false, 1.0), // not accepted
    ];
    const stats = computeAcceptedOfferStats(sales, NOW);
    expect(stats.acceptedOffers1h).toBe(1);
    expect(stats.acceptedOffers6h).toBe(2);
    expect(stats.acceptedOffers24h).toBe(3);
    expect(stats.medianSellerConcession).toBeCloseTo(0.22, 5);
    expect(stats.medianAcceptedPrice).toBeCloseTo(0.78, 5);
  });

  it('returns nulls when there are no accepted offers', () => {
    const stats = computeAcceptedOfferStats([s(1, 1, false, 1)], NOW);
    expect(stats.acceptedOffers24h).toBe(0);
    expect(stats.medianSellerConcession).toBeNull();
  });
});
