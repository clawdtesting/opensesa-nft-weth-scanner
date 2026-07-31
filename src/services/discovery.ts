import 'server-only';
import { prisma } from '@/lib/db';
import { getOpenSeaClient } from '@/lib/opensea/client';
import { parseFees } from '@/lib/opensea/parse';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';

/**
 * Collection discovery.
 *
 * Pipeline: pull top-volume collections from OpenSea + any configured seed
 * slugs, upsert lightweight Collection rows, and apply a *cheap* stats filter
 * (24h volume / sales) so expensive deep scans only run on collections that show
 * baseline life. Deep analysis happens later in the ingestion service.
 */
export async function discoverCollections(opts: { limit?: number } = {}): Promise<string[]> {
  const client = getOpenSeaClient();
  const limit = opts.limit ?? env.discoveryLimit;
  const slugs = new Set<string>(env.seedSlugs);

  try {
    let next: string | undefined;
    while (slugs.size < limit) {
      const page = await client.listCollections({ orderBy: 'seven_day_volume', limit: 100, next });
      for (const c of page.collections ?? []) {
        if (c.collection) slugs.add(c.collection);
        if (slugs.size >= limit) break;
      }
      if (!page.next) break;
      next = page.next;
    }
  } catch (err) {
    logger.error('discovery.list_failed', { error: String(err) });
  }

  logger.info('discovery.candidates', { count: slugs.size });

  const kept: string[] = [];
  for (const slug of slugs) {
    try {
      const passed = await upsertAndFilter(slug);
      if (passed) kept.push(slug);
    } catch (err) {
      logger.warn('discovery.slug_failed', { slug, error: String(err) });
    }
  }

  logger.info('discovery.kept', { count: kept.length });
  return kept;
}

/** Upsert a collection's metadata + fees and return whether it clears the cheap filter. */
async function upsertAndFilter(slug: string): Promise<boolean> {
  const client = getOpenSeaClient();
  const [meta, stats] = await Promise.all([
    client.getCollection(slug),
    client.getCollectionStats(slug),
  ]);

  const { marketplaceFeeBps, creatorFeeBps } = parseFees(meta);
  const contract = meta.contracts?.[0]?.address ?? null;
  const chain = meta.contracts?.[0]?.chain ?? env.opensea.chain;

  const oneDay = stats.intervals?.find((i) => i.interval === 'one_day');
  const volume24h = oneDay?.volume ?? 0;
  const sales24h = oneDay?.sales ?? 0;

  // Cheap filter: skip collections with essentially no daily activity. Uses a
  // deliberately loose threshold so borderline collections still get a deep scan.
  const active = volume24h >= 1 || sales24h >= 3;

  await prisma.collection.upsert({
    where: { slug },
    create: {
      slug,
      chain,
      contract,
      name: meta.name ?? slug,
      totalSupply: meta.total_supply ?? null,
      imageUrl: meta.image_url ?? null,
      openseaUrl: meta.opensea_url ?? `https://opensea.io/collection/${slug}`,
      marketplaceFeeBps,
      creatorFeeBps,
      discovered: true,
      active,
    },
    update: {
      name: meta.name ?? slug,
      contract,
      chain,
      totalSupply: meta.total_supply ?? null,
      imageUrl: meta.image_url ?? null,
      marketplaceFeeBps,
      creatorFeeBps,
      discovered: true,
      active,
    },
  });

  return active;
}
