import 'server-only';
import { prisma } from '@/lib/db';
import { evaluateFill, evaluateExit } from '@/lib/sim/simengine';
import { DEFAULT_STRATEGY, type StrategyConfig } from '@/config/strategy';
import type { SaleRecord } from '@/domain/types';
import { median } from '@/lib/math';

export interface BacktestConfig {
  start: Date;
  end: Date;
  startingCapitalEth: number;
  maxAllocationPerCollectionEth: number;
  maxConcurrentPositions: number;
  minScore: number;
  minExpectedRoi: number;
  fillWindowHours: number;
  maxHoldHours: number;
  strategy?: StrategyConfig;
}

export interface BacktestTrade {
  collectionSlug: string;
  bidEth: number;
  entryAt: string;
  entryEth: number;
  exitAt: string;
  exitEth: number;
  netProfit: number;
  roi: number;
  holdingHours: number;
}

export interface BacktestResult {
  config: Omit<BacktestConfig, 'strategy' | 'start' | 'end'> & { start: string; end: string };
  opportunitiesDetected: number;
  ordersSimulated: number;
  fills: number;
  fillRate: number;
  positionsExited: number;
  positionsOpen: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  roi: number;
  winRate: number;
  lossRate: number;
  maxDrawdown: number;
  averageHoldingHours: number | null;
  medianHoldingHours: number | null;
  profitPerWethHour: number | null;
  finalEquity: number;
  byCollection: Array<{ slug: string; trades: number; netPnl: number; winRate: number }>;
  trades: BacktestTrade[];
}

interface PendingRelease {
  releaseAt: number;
  amount: number;
}

/**
 * Snapshot-driven backtest.
 *
 * Signals come from stored MarketSnapshots (what the strategy would have seen at
 * the time). Fills and exits are resolved against the *actual* Sale records that
 * followed, using the shared simulation engine — so results reflect real market
 * behaviour, not assumptions. Capital is tracked chronologically with per-
 * collection allocation caps and a max-concurrent-positions limit.
 */
export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const cfg = config.strategy ?? DEFAULT_STRATEGY;

  const snapshots = await prisma.marketSnapshot.findMany({
    where: {
      timestamp: { gte: config.start, lte: config.end },
      score: { gte: config.minScore },
      recommendedBid: { not: null },
      realisticExit: { not: null },
      expectedRoi: { gte: config.minExpectedRoi },
    },
    orderBy: { timestamp: 'asc' },
    include: { collection: true },
  });

  // Pre-load sales per collection once.
  const salesByCollection = new Map<string, SaleRecord[]>();
  const collectionIds = [...new Set(snapshots.map((s) => s.collectionId))];
  for (const id of collectionIds) {
    const rows = await prisma.sale.findMany({ where: { collectionId: id }, orderBy: { timestamp: 'asc' } });
    salesByCollection.set(
      id,
      rows.map((s) => ({
        tokenId: s.tokenId,
        priceEth: s.priceEth,
        currency: s.currency,
        buyer: s.buyer,
        seller: s.seller,
        fromAcceptedOffer: s.fromAcceptedOffer,
        floorAtSale: s.floorAtSale,
        timestamp: s.timestamp,
      })),
    );
  }

  let available = config.startingCapitalEth;
  let equity = config.startingCapitalEth;
  let peakEquity = equity;
  let maxDrawdown = 0;
  const allocByCollection = new Map<string, number>();
  const pendingReleases: PendingRelease[] = [];
  const trades: BacktestTrade[] = [];

  let opportunitiesDetected = 0;
  let ordersSimulated = 0;
  let fills = 0;
  let positionsExited = 0;
  let openPositions = 0;

  const releaseDue = (nowMs: number) => {
    for (let i = pendingReleases.length - 1; i >= 0; i -= 1) {
      const p = pendingReleases[i]!;
      if (p.releaseAt <= nowMs) {
        available += p.amount;
        pendingReleases.splice(i, 1);
      }
    }
  };

  const activePositions = () => pendingReleases.length;

  for (const snap of snapshots) {
    opportunitiesDetected += 1;
    const nowMs = snap.timestamp.getTime();
    releaseDue(nowMs);

    const bid = snap.recommendedBid!;
    const target = snap.realisticExit!;
    const alloc = allocByCollection.get(snap.collectionId) ?? 0;

    // Capital / concentration / concurrency constraints.
    if (available < bid) continue;
    if (activePositions() >= config.maxConcurrentPositions) continue;
    if (alloc + bid > config.maxAllocationPerCollectionEth) continue;

    const sales = salesByCollection.get(snap.collectionId) ?? [];
    ordersSimulated += 1;

    const fill = evaluateFill(bid, snap.timestamp, sales, config.fillWindowHours);
    if (!fill.filled || !fill.filledAt) continue;
    fills += 1;

    const exit = evaluateExit({
      entry: fill.fillEth ?? bid,
      target,
      filledAt: fill.filledAt,
      subsequentSales: sales,
      maxHoldHours: config.maxHoldHours,
      fees: cfg.fees,
      marketplaceFeeBps: snap.collection.marketplaceFeeBps,
      creatorFeeBps: snap.collection.creatorFeeBps,
      fallbackPrice: snap.floor,
    });

    const entry = fill.fillEth ?? bid;
    available -= entry;
    allocByCollection.set(snap.collectionId, alloc + entry);
    const proceeds = entry + exit.netProfit;
    pendingReleases.push({ releaseAt: exit.exitAt.getTime(), amount: proceeds });

    positionsExited += 1;
    equity = available + pendingReleases.reduce((s, p) => s + p.amount, 0);
    peakEquity = Math.max(peakEquity, equity);
    maxDrawdown = Math.max(maxDrawdown, peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0);

    trades.push({
      collectionSlug: snap.collection.slug,
      bidEth: bid,
      entryAt: fill.filledAt.toISOString(),
      entryEth: entry,
      exitAt: exit.exitAt.toISOString(),
      exitEth: exit.exitEth,
      netProfit: exit.netProfit,
      roi: exit.roi,
      holdingHours: exit.holdingHours,
    });
  }

  // Release everything still pending at end of horizon.
  releaseDue(Number.MAX_SAFE_INTEGER);
  openPositions = 0;

  const nets = trades.map((t) => t.netProfit);
  const holds = trades.map((t) => t.holdingHours);
  const wins = trades.filter((t) => t.netProfit > 0).length;
  const losses = trades.filter((t) => t.netProfit <= 0).length;
  const netPnl = nets.reduce((a, b) => a + b, 0);
  const grossPnl = trades.reduce((a, t) => a + (t.exitEth - t.entryEth), 0);
  const totalFees = grossPnl - netPnl;
  const totalCapital = trades.reduce((a, t) => a + t.entryEth, 0);
  const totalHold = holds.reduce((a, b) => a + b, 0);

  const byCollectionMap = new Map<string, { trades: number; netPnl: number; wins: number }>();
  for (const t of trades) {
    const cur = byCollectionMap.get(t.collectionSlug) ?? { trades: 0, netPnl: 0, wins: 0 };
    cur.trades += 1;
    cur.netPnl += t.netProfit;
    if (t.netProfit > 0) cur.wins += 1;
    byCollectionMap.set(t.collectionSlug, cur);
  }

  return {
    config: {
      start: config.start.toISOString(),
      end: config.end.toISOString(),
      startingCapitalEth: config.startingCapitalEth,
      maxAllocationPerCollectionEth: config.maxAllocationPerCollectionEth,
      maxConcurrentPositions: config.maxConcurrentPositions,
      minScore: config.minScore,
      minExpectedRoi: config.minExpectedRoi,
      fillWindowHours: config.fillWindowHours,
      maxHoldHours: config.maxHoldHours,
    },
    opportunitiesDetected,
    ordersSimulated,
    fills,
    fillRate: ordersSimulated ? fills / ordersSimulated : 0,
    positionsExited,
    positionsOpen: openPositions,
    grossPnl,
    fees: totalFees,
    netPnl,
    roi: config.startingCapitalEth > 0 ? netPnl / config.startingCapitalEth : 0,
    winRate: trades.length ? wins / trades.length : 0,
    lossRate: trades.length ? losses / trades.length : 0,
    maxDrawdown,
    averageHoldingHours: holds.length ? totalHold / holds.length : null,
    medianHoldingHours: median(holds),
    profitPerWethHour: totalCapital > 0 && totalHold > 0 ? netPnl / (totalCapital * (totalHold / trades.length)) : null,
    finalEquity: available,
    byCollection: [...byCollectionMap.entries()].map(([slug, v]) => ({
      slug,
      trades: v.trades,
      netPnl: v.netPnl,
      winRate: v.trades ? v.wins / v.trades : 0,
    })),
    trades,
  };
}
