import { describe, it, expect } from 'vitest';
import { analyzeCollection, passesFilters } from '@/domain/analyze';
import { DEFAULT_STRATEGY } from '@/config/strategy';
import {
  healthyLiquid,
  highAcceptedBid,
  deadGiantSpread,
  fallingFloor,
  thinFakeFloor,
  highVolumeLowTx,
} from '@/lib/sim/fixtures';

const NOW = new Date('2026-01-10T12:00:00Z');

function analyze(fixtureFn: typeof healthyLiquid, seed = 1) {
  const f = fixtureFn({ now: NOW, seed });
  return analyzeCollection(
    {
      sales: f.sales,
      listings: f.listings,
      offers: f.offers,
      marketplaceFeeBps: f.marketplaceFeeBps,
      creatorFeeBps: f.creatorFeeBps,
      now: NOW,
    },
    DEFAULT_STRATEGY,
  );
}

describe('analyzeCollection archetypes', () => {
  it('healthy liquid collection scores high and passes filters', () => {
    const a = analyze(healthyLiquid);
    expect(a.opportunity.score).toBeGreaterThan(60);
    expect(a.velocity.sales24h).toBeGreaterThanOrEqual(10);
    expect(a.accepted.acceptedOffers24h).toBeGreaterThan(0);
    expect(passesFilters(a, DEFAULT_STRATEGY)).toBe(true);
  });

  it('high accepted-bid collection has strong seller concession and passes', () => {
    const a = analyze(highAcceptedBid);
    expect(a.accepted.medianSellerConcession).toBeGreaterThan(0.1);
    expect(a.accepted.acceptedOffers24h).toBeGreaterThan(5);
    expect(passesFilters(a, DEFAULT_STRATEGY)).toBe(true);
  });

  it('dead collection with a giant spread is rejected despite the headline gap', () => {
    const a = analyze(deadGiantSpread);
    expect(a.spread.rawSpread!).toBeGreaterThan(0.5); // huge headline spread
    expect(a.opportunity.score).toBeLessThan(40); // but scored poorly
    expect(passesFilters(a, DEFAULT_STRATEGY)).toBe(false);
  });

  it('high-volume/low-tx collection is flagged for distortion', () => {
    const a = analyze(highVolumeLowTx);
    expect(a.velocity.volume24h).toBeGreaterThan(30);
    expect(a.velocity.sales24h).toBeLessThan(5);
    expect(passesFilters(a, DEFAULT_STRATEGY)).toBe(false);
  });

  it('thin/fake floor collection is penalised and filtered out', () => {
    const a = analyze(thinFakeFloor);
    expect(passesFilters(a, DEFAULT_STRATEGY)).toBe(false);
  });

  it('falling floor collection produces a downward trend', () => {
    const a = analyze(fallingFloor);
    expect(a.trend).toBeLessThan(0);
  });

  it('every archetype yields an explainable score with components', () => {
    for (const fn of [healthyLiquid, highAcceptedBid, deadGiantSpread, fallingFloor, thinFakeFloor, highVolumeLowTx]) {
      const a = analyze(fn);
      expect(a.opportunity.score).toBeGreaterThanOrEqual(0);
      expect(a.opportunity.score).toBeLessThanOrEqual(100);
      expect(Object.keys(a.opportunity.components).length).toBeGreaterThan(0);
      expect(a.realisticExit.explanation.length).toBeGreaterThan(0);
    }
  });
});
