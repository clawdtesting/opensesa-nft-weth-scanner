import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { analyzeCollection, passesFilters, type Analysis } from '@/domain/analyze';
import { resolveStrategy, type StrategyConfig, DEFAULT_STRATEGY } from '@/config/strategy';
import type { SaleRecord, ListingRecord, OfferRecord } from '@/domain/types';
import { logger } from '@/lib/logger';

const HOUR = 3_600_000;

/**
 * Build and persist a market snapshot + opportunity for a collection from its
 * freshly-ingested records. Also back-fills `floorAtSale` on accepted-offer
 * sales using the current floor so seller-concession stats improve over time.
 */
export async function buildSnapshot(params: {
  collectionId: string;
  sales: readonly SaleRecord[];
  listings: readonly ListingRecord[];
  offers: readonly OfferRecord[];
  strategy?: StrategyConfig;
  now?: Date;
}): Promise<{ analysis: Analysis; snapshotId: string; passes: boolean }> {
  const now = params.now ?? new Date();
  const cfg = params.strategy ?? (await loadDefaultStrategy());

  const collection = await prisma.collection.findUnique({ where: { id: params.collectionId } });
  if (!collection) throw new Error(`Collection not found: ${params.collectionId}`);

  // Floor 6h ago from the most recent snapshot at least 6h old.
  const prior = await prisma.marketSnapshot.findFirst({
    where: { collectionId: params.collectionId, timestamp: { lte: new Date(now.getTime() - 6 * HOUR) } },
    orderBy: { timestamp: 'desc' },
  });

  const analysis = analyzeCollection(
    {
      sales: params.sales,
      listings: params.listings,
      offers: params.offers,
      marketplaceFeeBps: collection.marketplaceFeeBps,
      creatorFeeBps: collection.creatorFeeBps,
      floor6hAgo: prior?.floor ?? null,
      now,
    },
    cfg,
  );

  const a = analysis;
  const snapshot = await prisma.marketSnapshot.create({
    data: {
      collectionId: params.collectionId,
      timestamp: now,
      floor: a.floorBook.floor,
      realisticExit: a.realisticExit.price,
      exitConfidence: a.realisticExit.confidence,
      bestBid: a.bidBook.bestBid,
      secondBid: a.bidBook.secondBid,
      thirdBid: a.bidBook.thirdBid,
      offerCount: a.bidBook.offerCount,
      distanceBestToSecond: a.bidBook.distanceBestToSecond,
      sales1h: a.velocity.sales1h,
      sales6h: a.velocity.sales6h,
      sales24h: a.velocity.sales24h,
      sales7d: a.velocity.sales7d,
      volume1h: a.velocity.volume1h,
      volume24h: a.velocity.volume24h,
      volume7d: a.velocity.volume7d,
      uniqueBuyers24h: a.velocity.uniqueBuyers24h,
      uniqueSellers24h: a.velocity.uniqueSellers24h,
      medianSale24h: a.velocity.medianSale24h,
      acceptedOffers1h: a.accepted.acceptedOffers1h,
      acceptedOffers24h: a.accepted.acceptedOffers24h,
      acceptedOffers7d: a.accepted.acceptedOffers7d,
      medianSellerConcession: a.accepted.medianSellerConcession,
      floorDepth1: a.floorBook.floorDepth1,
      floorDepth2: a.floorBook.floorDepth2,
      floorDepth5: a.floorBook.floorDepth5,
      floorDepth10: a.floorBook.floorDepth10,
      bidDepth1: a.bidBook.bidDepth1,
      bidDepth2: a.bidBook.bidDepth2,
      bidDepth5: a.bidBook.bidDepth5,
      bidDepth10: a.bidBook.bidDepth10,
      recommendedBid: a.recommendedBid.bid,
      expectedProfit: a.spread.expectedNetProfit,
      expectedRoi: a.spread.expectedRoi,
      fillProbability: a.probabilities.fillProbability,
      exitProbability24h: a.probabilities.exitProbability24h,
      exitProbability72h: a.probabilities.exitProbability72h,
      estimatedHoldingHours: a.probabilities.estimatedHoldingHours,
      capitalEfficiency: a.capitalEfficiency,
      score: a.opportunity.score,
      scoreDetail: {
        components: a.opportunity.components,
        weightedComponents: a.opportunity.weightedComponents,
        riskPenalties: a.opportunity.riskPenalties,
        reason: a.opportunity.reason,
        realisticExit: {
          inputs: a.realisticExit.inputs,
          weights: a.realisticExit.weights,
          explanation: a.realisticExit.explanation,
        },
        recommendedBid: { basis: a.recommendedBid.basis, explanation: a.recommendedBid.explanation },
        spread: a.spread,
        floorChange6h: a.floorChange6h,
        trend: a.trend,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const passes = passesFilters(analysis, cfg);

  await prisma.opportunity.upsert({
    where: { collectionId: params.collectionId },
    create: {
      collectionId: params.collectionId,
      snapshotId: snapshot.id,
      score: a.opportunity.score,
      passesFilter: passes,
      reason: a.opportunity.reason,
      detail: { components: a.opportunity.components, riskPenalties: a.opportunity.riskPenalties },
    },
    update: {
      snapshotId: snapshot.id,
      score: a.opportunity.score,
      passesFilter: passes,
      reason: a.opportunity.reason,
      detail: { components: a.opportunity.components, riskPenalties: a.opportunity.riskPenalties },
    },
  });

  // Back-fill floorAtSale for accepted-offer sales missing it (best-effort).
  if (a.floorBook.floor !== null) {
    await prisma.sale
      .updateMany({
        where: { collectionId: params.collectionId, fromAcceptedOffer: true, floorAtSale: null },
        data: { floorAtSale: a.floorBook.floor },
      })
      .catch(() => undefined);
  }

  logger.info('snapshot.built', {
    collectionId: params.collectionId,
    score: Math.round(a.opportunity.score),
    passes,
  });

  return { analysis, snapshotId: snapshot.id, passes };
}

/** Re-rank all current opportunities and persist their rank. */
export async function rerankOpportunities(): Promise<void> {
  const opps = await prisma.opportunity.findMany({ orderBy: { score: 'desc' } });
  await Promise.all(
    opps.map((o, i) => prisma.opportunity.update({ where: { id: o.id }, data: { rank: i + 1 } })),
  );
}

async function loadDefaultStrategy(): Promise<StrategyConfig> {
  const row = await prisma.strategyConfiguration.findFirst({ where: { isDefault: true } });
  if (!row) return DEFAULT_STRATEGY;
  try {
    return resolveStrategy(row.config as never);
  } catch {
    return DEFAULT_STRATEGY;
  }
}
