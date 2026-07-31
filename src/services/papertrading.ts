import 'server-only';
import { prisma } from '@/lib/db';
import { evaluateFill, evaluateExit } from '@/lib/sim/simengine';
import { DEFAULT_STRATEGY } from '@/config/strategy';
import { logger } from '@/lib/logger';

/**
 * Live paper-trading engine.
 *
 * When a collection's latest snapshot qualifies as an opportunity we open a
 * simulated WETH offer at the recommended bid (one open order per collection at
 * a time). On each scan we then try to progress existing orders/positions using
 * the sales observed since they were opened — never touching real funds. This is
 * the SimulationExecutionEngine referenced in the architecture; a real
 * ExecutionEngine can later implement the same interface.
 */
export async function recordPaperTrades(collectionId: string): Promise<void> {
  const snapshot = await prisma.marketSnapshot.findFirst({
    where: { collectionId },
    orderBy: { timestamp: 'desc' },
  });
  if (!snapshot || snapshot.recommendedBid === null || snapshot.realisticExit === null) return;

  const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
  if (!collection) return;

  // Open a new simulated order if none is currently open for this collection.
  const openOrder = await prisma.simulatedOrder.findFirst({
    where: { collectionId, status: 'OPEN', runId: null },
  });
  if (!openOrder) {
    await prisma.simulatedOrder.create({
      data: {
        collectionId,
        bidEth: snapshot.recommendedBid,
        bidAt: snapshot.timestamp,
        status: 'OPEN',
        detail: { realisticExit: snapshot.realisticExit, score: snapshot.score },
      },
    });
    logger.info('paper.order_opened', { collectionId, bid: snapshot.recommendedBid });
  }

  await progressPaperTrades(collectionId);
}

/** Advance all live (runId=null) orders/positions for a collection using observed sales. */
export async function progressPaperTrades(collectionId: string): Promise<void> {
  const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
  if (!collection) return;

  const orders = await prisma.simulatedOrder.findMany({
    where: { collectionId, runId: null, status: { in: ['OPEN', 'FILLED'] } },
    include: { position: true },
  });

  for (const order of orders) {
    const sales = await prisma.sale.findMany({
      where: { collectionId, timestamp: { gte: order.bidAt } },
      orderBy: { timestamp: 'asc' },
    });
    const saleRecords = sales.map((s) => ({
      tokenId: s.tokenId,
      priceEth: s.priceEth,
      currency: s.currency,
      buyer: s.buyer,
      seller: s.seller,
      fromAcceptedOffer: s.fromAcceptedOffer,
      floorAtSale: s.floorAtSale,
      timestamp: s.timestamp,
    }));

    if (order.status === 'OPEN') {
      const fill = evaluateFill(order.bidEth, order.bidAt, saleRecords, 72);
      if (fill.filled && fill.filledAt) {
        await prisma.simulatedOrder.update({
          where: { id: order.id },
          data: { status: 'FILLED', filledAt: fill.filledAt, fillEth: fill.fillEth },
        });
        await prisma.simulatedPosition.create({
          data: {
            orderId: order.id,
            entryEth: fill.fillEth ?? order.bidEth,
            entryAt: fill.filledAt,
            status: 'OPEN',
          },
        });
        logger.info('paper.order_filled', { collectionId, orderId: order.id });
      }
      continue;
    }

    // FILLED order with an open position — try to exit.
    if (order.status === 'FILLED' && order.position && order.position.status === 'OPEN') {
      const target = (order.detail as { realisticExit?: number } | null)?.realisticExit;
      if (!target) continue;
      const exit = evaluateExit({
        entry: order.position.entryEth,
        target,
        filledAt: order.position.entryAt,
        subsequentSales: saleRecords,
        maxHoldHours: 168,
        fees: DEFAULT_STRATEGY.fees,
        marketplaceFeeBps: collection.marketplaceFeeBps,
        creatorFeeBps: collection.creatorFeeBps,
      });
      // Only close on a genuine buyer at target (not a forced mark-to-market) in
      // live mode, so open positions reflect reality until they truly clear.
      if (exit.reason.startsWith('Sold at target')) {
        await prisma.simulatedPosition.update({
          where: { id: order.position.id },
          data: {
            exitEth: exit.exitEth,
            exitAt: exit.exitAt,
            status: 'CLOSED',
            grossProfit: exit.grossProfit,
            fees: exit.fees,
            gas: exit.gas,
            netProfit: exit.netProfit,
            roi: exit.roi,
            holdingHours: exit.holdingHours,
          },
        });
        logger.info('paper.position_closed', { collectionId, net: exit.netProfit });
      }
    }
  }
}

export interface PaperPortfolio {
  capitalAllocated: number;
  openPositions: number;
  closedPositions: number;
  totalNetPnl: number;
  winRate: number | null;
  averageRoi: number | null;
  medianHoldingHours: number | null;
  profitPerWethHour: number | null;
}

/** Aggregate the live paper portfolio for the dashboard. */
export async function getPaperPortfolio(): Promise<PaperPortfolio> {
  const positions = await prisma.simulatedPosition.findMany({ where: { runId: null } });
  const open = positions.filter((p) => p.status === 'OPEN');
  const closed = positions.filter((p) => p.status === 'CLOSED');

  const openOrders = await prisma.simulatedOrder.findMany({
    where: { runId: null, status: { in: ['OPEN', 'FILLED'] } },
  });
  const capitalAllocated =
    openOrders.reduce((s, o) => s + (o.fillEth ?? o.bidEth), 0);

  const nets = closed.map((p) => p.netProfit ?? 0);
  const rois = closed.map((p) => p.roi ?? 0);
  const holds = closed.map((p) => p.holdingHours ?? 0).sort((a, b) => a - b);
  const wins = closed.filter((p) => (p.netProfit ?? 0) > 0).length;
  const totalNet = nets.reduce((a, b) => a + b, 0);
  const totalHold = holds.reduce((a, b) => a + b, 0);

  return {
    capitalAllocated,
    openPositions: open.length,
    closedPositions: closed.length,
    totalNetPnl: totalNet,
    winRate: closed.length ? wins / closed.length : null,
    averageRoi: rois.length ? rois.reduce((a, b) => a + b, 0) / rois.length : null,
    medianHoldingHours: holds.length ? holds[Math.floor(holds.length / 2)]! : null,
    profitPerWethHour:
      capitalAllocated > 0 && totalHold > 0 ? totalNet / (capitalAllocated * (totalHold || 1)) : null,
  };
}
