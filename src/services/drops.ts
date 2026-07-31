import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getOpenSeaClient } from '@/lib/opensea/client';
import { parseDrops } from '@/lib/opensea/dropsParse';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import type { DropItem, DropCategory } from '@/domain/types';

export interface DropsResult {
  category: DropCategory;
  chain: 'ethereum';
  items: DropItem[];
  source: 'opensea-drops' | 'official-collections' | 'cache' | 'unavailable';
  note?: string;
  lastRefreshAt: string | null;
  newCount: number;
}

/** How long a cached category is considered fresh before a read triggers a refresh. */
const CACHE_TTL_MS = 5 * 60_000;

/**
 * Cached read used by the Drops tabs — loads instantly from the DB snapshot.
 * If the category has never been fetched (or is stale) it refreshes first.
 */
export async function getDropsCached(category: DropCategory): Promise<DropsResult> {
  const meta = await prisma.dropFetchMeta.findUnique({ where: { category } });
  const stale = !meta || Date.now() - meta.lastRefreshAt.getTime() > CACHE_TTL_MS;
  if (stale) return refreshDrops(category);
  return readFromCache(category);
}

/** Force a live fetch from OpenSea, persist the snapshot, and return it. */
export async function refreshDrops(category: DropCategory): Promise<DropsResult> {
  if (!env.opensea.apiKey) {
    return { category, chain: 'ethereum', items: [], source: 'unavailable', note: 'OPENSEA_API_KEY not configured.', lastRefreshAt: null, newCount: 0 };
  }

  const fetched = await fetchLive(category);

  // Only persist a successful, non-empty fetch — a transient upstream failure
  // must not wipe the existing cache.
  if (fetched.items.length > 0) {
    await persistSnapshot(category, fetched.items, fetched.source, fetched.note);
    return readFromCache(category);
  }

  // Nothing fetched: fall back to whatever we have cached (resilience).
  const cached = await readFromCache(category);
  if (cached.items.length > 0) {
    return { ...cached, note: fetched.note ?? cached.note };
  }
  return {
    category,
    chain: 'ethereum',
    items: [],
    source: 'unavailable',
    note:
      fetched.note ??
      (category === 'recently_minted'
        ? 'No recent Ethereum collections returned.'
        : "OpenSea's drops feed is unavailable (it is not part of the official public API)."),
    lastRefreshAt: null,
    newCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Live fetch (OpenSea internal feed + official fallback for recently_minted)
// ---------------------------------------------------------------------------

async function fetchLive(
  category: DropCategory,
): Promise<{ items: DropItem[]; source: DropsResult['source']; note?: string }> {
  const client = getOpenSeaClient();
  let items: DropItem[] = [];
  let source: DropsResult['source'] = 'unavailable';
  let note: string | undefined;

  try {
    const raw = await client.getDrops(category);
    items = parseDrops(raw, category);
    if (items.length > 0) source = 'opensea-drops';
  } catch (err) {
    logger.warn('drops.feed_unavailable', { category, error: String(err) });
  }

  if (items.length === 0 && category === 'recently_minted') {
    try {
      const page = await client.listCollections({ orderBy: 'created_date', limit: 40 });
      items = (page.collections ?? [])
        .filter((c) => (c.contracts?.[0]?.chain ?? env.opensea.chain).toLowerCase() === 'ethereum')
        .map((c) => ({
          slug: c.collection,
          name: c.name ?? c.collection,
          chain: 'ethereum' as const,
          imageUrl: c.image_url ?? null,
          contract: c.contracts?.[0]?.address ?? null,
          openseaUrl: `https://opensea.io/collection/${c.collection}`,
          featured: false,
          mintPriceEth: null,
          mintCurrency: null,
          mintStart: null,
          mintEnd: null,
          mintStage: null,
          maxPerWallet: null,
          totalSupply: null,
          isLive: false,
        }));
      if (items.length > 0) {
        source = 'official-collections';
        note = 'Newest Ethereum collections (official API); mint-stage fields unavailable.';
      }
    } catch (err) {
      logger.warn('drops.official_fallback_failed', { error: String(err) });
    }
  }

  return { items, source, note };
}

// ---------------------------------------------------------------------------
// Persistence + cache read
// ---------------------------------------------------------------------------

async function persistSnapshot(
  category: DropCategory,
  items: DropItem[],
  source: DropsResult['source'],
  note: string | undefined,
): Promise<void> {
  const now = new Date();
  const prev = await prisma.dropFetchMeta.findUnique({ where: { category } });

  await prisma.$transaction([
    // Upsert each current item (create keeps firstSeenAt=now; update refreshes data + lastSeenAt).
    ...items.map((item) =>
      prisma.dropRecord.upsert({
        where: { category_slug: { category, slug: item.slug } },
        create: { category, slug: item.slug, chain: 'ethereum', data: item as unknown as Prisma.InputJsonValue, lastSeenAt: now },
        update: { data: item as unknown as Prisma.InputJsonValue, lastSeenAt: now },
      }),
    ),
    // Drop rows no longer present in the feed (keeps the cache = latest fetch).
    prisma.dropRecord.deleteMany({
      where: { category, slug: { notIn: items.map((i) => i.slug) } },
    }),
    prisma.dropFetchMeta.upsert({
      where: { category },
      create: { category, lastRefreshAt: now, prevRefreshAt: null, source, note },
      update: { prevRefreshAt: prev?.lastRefreshAt ?? null, lastRefreshAt: now, source, note },
    }),
  ]);

  logger.info('drops.snapshot_saved', { category, count: items.length, source });
}

async function readFromCache(category: DropCategory): Promise<DropsResult> {
  const [meta, records] = await Promise.all([
    prisma.dropFetchMeta.findUnique({ where: { category } }),
    prisma.dropRecord.findMany({ where: { category }, orderBy: { firstSeenAt: 'desc' } }),
  ]);

  // "New since last check" = first seen after the previous refresh.
  const prevRefresh = meta?.prevRefreshAt ?? null;
  const baseItems: DropItem[] = records.map((r) => ({
    ...(r.data as unknown as DropItem),
    isNew: prevRefresh ? r.firstSeenAt.getTime() > prevRefresh.getTime() : false,
  }));

  const items = await enrichWithScanner(baseItems);
  const newCount = items.filter((i) => i.isNew).length;

  return {
    category,
    chain: 'ethereum',
    items,
    source: (meta?.source as DropsResult['source']) ?? 'cache',
    note: meta?.note ?? undefined,
    lastRefreshAt: meta?.lastRefreshAt.toISOString() ?? null,
    newCount,
  };
}

/** Refresh all three categories — used by the background cron to keep the cache warm. */
export async function refreshAllDrops(): Promise<void> {
  for (const category of ['upcoming', 'featured', 'recently_minted'] as DropCategory[]) {
    try {
      await refreshDrops(category);
    } catch (err) {
      logger.warn('drops.refresh_failed', { category, error: String(err) });
    }
  }
}

/**
 * Attach existing scanner metrics (floor, best bid, 24h volume, offer→floor
 * spread, score) when we already track the collection. Reuses the latest
 * MarketSnapshot — it does NOT run the scanner or duplicate logic.
 */
async function enrichWithScanner(items: DropItem[]): Promise<DropItem[]> {
  if (items.length === 0) return items;
  const slugs = items.map((i) => i.slug);

  const collections = await prisma.collection.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(collections.map((c) => [c.slug, c.id]));

  const snapshots = await prisma.marketSnapshot.findMany({
    where: { collectionId: { in: collections.map((c) => c.id) } },
    orderBy: { timestamp: 'desc' },
    distinct: ['collectionId'],
  });
  const snapByCollection = new Map(snapshots.map((s) => [s.collectionId, s]));

  return items.map((item) => {
    const collectionId = idBySlug.get(item.slug);
    const snap = collectionId ? snapByCollection.get(collectionId) : undefined;
    if (!snap) {
      return { ...item, scanner: { floor: null, bestBid: null, volume24h: null, offerToFloorSpread: null, score: null, hasData: false } };
    }
    const spread =
      snap.floor && snap.floor > 0 && snap.bestBid !== null
        ? (snap.floor - snap.bestBid) / snap.floor
        : null;
    return {
      ...item,
      scanner: {
        floor: snap.floor,
        bestBid: snap.bestBid,
        volume24h: snap.volume24h,
        offerToFloorSpread: spread,
        score: snap.score,
        hasData: true,
      },
    };
  });
}
