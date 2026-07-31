import 'server-only';
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
