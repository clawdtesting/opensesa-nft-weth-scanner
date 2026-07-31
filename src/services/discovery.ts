import 'server-only';
import { prisma } from '@/lib/db';
import { getOpenSeaClient } from '@/lib/opensea/client';
import { parseFees } from '@/lib/opensea/parse';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';

export interface DiscoveryOptions {
  limit?: number;
  /** Only keep collections whose OpenSea floor is at or below this (ETH). */
  maxFloor?: number;
  /**
   * Also pull the newest collections (order_by=created_date), not just top
   * volume — needed to reach cheap/low-floor collections. Defaults to true when
   * maxFloor is set.
   */
  includeNewest?: boolean;
}

/**
 * Collection discovery.
 *
 * Gathers candidate slugs (top 7-day volume, optionally plus newest), upserts
 * lightweight Collection rows, and applies a cheap stats filter (24h volume /
 * sales, and an optional floor cap) so expensive deep scans only run on
 * collections that clear the bar. Returns the kept slugs.
 */
export async function discoverCollections(opts: DiscoveryOptions = {}): Promise<string[]> {
  const client = getOpenSeaClient();
  const limit = opts.limit ?? env.discoveryLimit;
  const includeNewest = opts.includeNewest ?? opts.maxFloor !== undefined;
  const slugs = new Set<string>(env.seedSlugs);

  const gather = async (orderBy: 'seven_day_volume' | 'created_date', cap: number) => {
    try {
      let next: string | undefined;
      while (slugs.size < cap) {
        const page = await client.listCollections({ orderBy, limit: 100, next });
        for (const c of page.collections ?? []) {
          if (c.collection) slugs.add(c.collection);
          if (slugs.size >= cap) break;
        }
        if (!page.next) break;
        next = page.next;
      }
    } catch (err) {
      logger.error('discovery.list_failed', { orderBy, error: String(err) });
    }
  };

  await gather('seven_day_volume', includeNewest ? Math.ceil(limit / 2) : limit);
  if (includeNewest) await gather('created_date', limit);

  logger.info('discovery.candidates', { count: slugs.size, includeNewest, maxFloor: opts.maxFloor });

  const kept: string[] = [];
  for (const slug of slugs) {
    try {
      const passed = await upsertAndFilter(slug, opts.maxFloor);
      if (passed) kept.push(slug);
    } catch (err) {
      logger.warn('discovery.slug_failed', { slug, error: String(err) });
    }
  }

  logger.info('discovery.kept', { count: kept.length, maxFloor: opts.maxFloor });
  return kept;
}

/** Upsert a collection's metadata + fees; return whether it clears the filters. */
async function upsertAndFilter(slug: string, maxFloor?: number): Promise<boolean> {
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
  const floor = stats.total?.floor_price;

  // Cheap filter: baseline daily activity …
  const hasActivity = volume24h >= 1 || sales24h >= 3;
  // … plus an optional floor cap (skip when floor is unknown and a cap is set).
  const withinFloor =
    maxFloor === undefined ? true : typeof floor === 'number' && floor > 0 && floor <= maxFloor;
  const active = hasActivity && withinFloor;

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
