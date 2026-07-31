import 'server-only';
import { prisma } from '@/lib/db';
import { discoverCollections } from './discovery';
import { ingestCollection } from './ingestion';
import { buildSnapshot, rerankOpportunities } from './snapshot';
import { recordPaperTrades } from './papertrading';
import { logger } from '@/lib/logger';

export interface ScanResult {
  discovered: number;
  scanned: number;
  failed: number;
  opportunities: number;
  durationMs: number;
}

/**
 * Full scan cycle: discover → ingest → snapshot → rank → paper-trade.
 *
 * Designed to be safe to run repeatedly (e.g. on a cron / interval). Failures on
 * one collection never abort the whole cycle.
 */
export async function runScan(opts: { limit?: number; slugs?: string[] } = {}): Promise<ScanResult> {
  const start = Date.now();
  const slugs = opts.slugs ?? (await discoverCollections({ limit: opts.limit }));
  logger.info('scan.start', { collections: slugs.length });

  let scanned = 0;
  let failed = 0;
  let opportunities = 0;

  for (const slug of slugs) {
    try {
      const { collectionId, sales, listings, offers } = await ingestCollection(slug);
      const { passes } = await buildSnapshot({ collectionId, sales, listings, offers });
      if (passes) {
        opportunities += 1;
        await recordPaperTrades(collectionId).catch((err) =>
          logger.warn('scan.paper_trade_failed', { slug, error: String(err) }),
        );
      }
      scanned += 1;
    } catch (err) {
      failed += 1;
      logger.error('scan.collection_failed', { slug, error: String(err) });
    }
  }

  await rerankOpportunities();

  const result: ScanResult = {
    discovered: slugs.length,
    scanned,
    failed,
    opportunities,
    durationMs: Date.now() - start,
  };
  logger.info('scan.done', { ...result });
  return result;
}

/**
 * Rotating scan for a background cron.
 *
 * Serverless functions can't scan the whole universe in one request, so each
 * tick scans the `batchSize` least-recently-updated active collections and then
 * bumps their `updatedAt` so the next tick picks up the next slice — cycling
 * through everything over time. Pass `discover: true` (e.g. once a day) to
 * refresh/expand the universe first; otherwise it just scans what's known.
 */
export async function runRotatingScan(opts: {
  batchSize?: number;
  discover?: boolean;
  discoverLimit?: number;
} = {}): Promise<ScanResult & { batch: string[] }> {
  const batchSize = opts.batchSize ?? 10;

  if (opts.discover) {
    await discoverCollections({ limit: opts.discoverLimit });
  }

  const pick = async () =>
    (
      await prisma.collection.findMany({
        where: { active: true },
        orderBy: { updatedAt: 'asc' },
        take: batchSize,
        select: { slug: true },
      })
    ).map((c) => c.slug);

  let slugs = await pick();
  // Cold start: nothing known yet — discover once, then pick.
  if (slugs.length === 0) {
    await discoverCollections({ limit: opts.discoverLimit });
    slugs = await pick();
  }

  const result = await runScan({ slugs });

  // Advance the rotation cursor: bumping updatedAt moves these to the back of
  // the queue so subsequent ticks scan different collections.
  if (slugs.length > 0) {
    await prisma.collection.updateMany({ where: { slug: { in: slugs } }, data: { active: true } });
  }

  logger.info('scan.rotating_done', { batch: slugs.length, discover: Boolean(opts.discover) });
  return { ...result, batch: slugs };
}
