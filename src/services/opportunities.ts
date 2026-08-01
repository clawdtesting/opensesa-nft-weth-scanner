import 'server-only';
import type { Opportunity, Collection, MarketSnapshot } from '@prisma/client';
import { prisma } from '@/lib/db';

export interface OpportunityRow {
  slug: string;
  name: string;
  imageUrl: string | null;
  chain: string;
  rank: number | null;
  score: number;
  passesFilter: boolean;
  floor: number | null;
  realisticExit: number | null;
  bestBid: number | null;
  recommendedBid: number | null;
  rawSpread: number | null;
  expectedProfit: number | null;
  expectedRoi: number | null;
  sales1h: number;
  sales24h: number;
  acceptedOffers24h: number;
  floorDepth5: number;
  fillProbability: number | null;
  exitProbability24h: number | null;
  estimatedHoldingHours: number | null;
  capitalEfficiency: number | null;
  reason: string | null;
}

export interface OpportunityFilters {
  minVolume24h?: number;
  minSales24h?: number;
  minAcceptedOffers24h?: number;
  minRawSpread?: number;
  minRoi?: number;
  minScore?: number;
  floorMin?: number;
  floorMax?: number;
  chain?: string;
  onlyPassing?: boolean;
}

/** Read the ranked opportunity table for the dashboard, joined to the latest snapshot. */
export async function listOpportunities(filters: OpportunityFilters = {}): Promise<OpportunityRow[]> {
  const opps = await prisma.opportunity.findMany({
    orderBy: { score: 'desc' },
    include: { collection: true },
  });

  const rows: OpportunityRow[] = [];
  for (const opp of opps) {
    const snap = opp.snapshotId
      ? await prisma.marketSnapshot.findUnique({ where: { id: opp.snapshotId } })
      : await prisma.marketSnapshot.findFirst({
          where: { collectionId: opp.collectionId },
          orderBy: { timestamp: 'desc' },
        });
    if (!snap) continue;

    const row = toRow(opp, opp.collection, snap);
    if (!matches(row, snap.volume24h, filters)) continue;
    rows.push(row);
  }

  return rows;
}

/** Map an opportunity + its collection + latest snapshot into a dashboard row. */
function toRow(opp: Opportunity, collection: Collection, snap: MarketSnapshot): OpportunityRow {
  const rawSpread =
    snap.floor && snap.floor > 0 && snap.bestBid !== null
      ? (snap.floor - snap.bestBid) / snap.floor
      : null;
  return {
    slug: collection.slug,
    name: collection.name,
    imageUrl: collection.imageUrl,
    chain: collection.chain,
    rank: opp.rank,
    score: opp.score,
    passesFilter: opp.passesFilter,
    floor: snap.floor,
    realisticExit: snap.realisticExit,
    bestBid: snap.bestBid,
    recommendedBid: snap.recommendedBid,
    rawSpread,
    expectedProfit: snap.expectedProfit,
    expectedRoi: snap.expectedRoi,
    sales1h: snap.sales1h,
    sales24h: snap.sales24h,
    acceptedOffers24h: snap.acceptedOffers24h,
    floorDepth5: snap.floorDepth5,
    fillProbability: snap.fillProbability,
    exitProbability24h: snap.exitProbability24h,
    estimatedHoldingHours: snap.estimatedHoldingHours,
    capitalEfficiency: snap.capitalEfficiency,
    reason: opp.reason,
  };
}

/** Fetch a single up-to-date opportunity row for one collection (post-refresh). */
export async function getOpportunityRow(slug: string): Promise<OpportunityRow | null> {
  const collection = await prisma.collection.findUnique({ where: { slug } });
  if (!collection) return null;
  const [opp, snap] = await Promise.all([
    prisma.opportunity.findUnique({ where: { collectionId: collection.id } }),
    prisma.marketSnapshot.findFirst({
      where: { collectionId: collection.id },
      orderBy: { timestamp: 'desc' },
    }),
  ]);
  if (!opp || !snap) return null;
  return toRow(opp, collection, snap);
}

function matches(
  row: OpportunityRow,
  volume24h: number,
  f: OpportunityFilters,
): boolean {
  if (f.onlyPassing && !row.passesFilter) return false;
  if (f.chain && row.chain !== f.chain) return false;
  if (f.minVolume24h !== undefined && volume24h < f.minVolume24h) return false;
  if (f.minSales24h !== undefined && row.sales24h < f.minSales24h) return false;
  if (f.minAcceptedOffers24h !== undefined && row.acceptedOffers24h < f.minAcceptedOffers24h) return false;
  if (f.minRawSpread !== undefined && (row.rawSpread ?? -Infinity) < f.minRawSpread) return false;
  if (f.minRoi !== undefined && (row.expectedRoi ?? -Infinity) < f.minRoi) return false;
  if (f.minScore !== undefined && row.score < f.minScore) return false;
  if (f.floorMin !== undefined && (row.floor ?? 0) < f.floorMin) return false;
  if (f.floorMax !== undefined && (row.floor ?? Infinity) > f.floorMax) return false;
  return true;
}

/** Full detail payload for a collection page. */
export async function getCollectionDetail(slug: string) {
  const collection = await prisma.collection.findUnique({ where: { slug } });
  if (!collection) return null;

  const [snapshot, opportunity, sales, listings, offers, history] = await Promise.all([
    prisma.marketSnapshot.findFirst({
      where: { collectionId: collection.id },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.opportunity.findUnique({ where: { collectionId: collection.id } }),
    prisma.sale.findMany({
      where: { collectionId: collection.id },
      orderBy: { timestamp: 'desc' },
      take: 25,
    }),
    prisma.listing.findMany({
      where: { collectionId: collection.id, active: true },
      orderBy: { priceEth: 'asc' },
      take: 25,
    }),
    prisma.offer.findMany({
      where: { collectionId: collection.id, active: true },
      orderBy: { priceEth: 'desc' },
      take: 25,
    }),
    prisma.marketSnapshot.findMany({
      where: { collectionId: collection.id },
      orderBy: { timestamp: 'desc' },
      take: 48,
    }),
  ]);

  return { collection, snapshot, opportunity, sales, listings, offers, history: history.reverse() };
}
