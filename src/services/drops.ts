import 'server-only';
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
  source: 'opensea-drops' | 'official-collections' | 'unavailable';
  note?: string;
}

/**
 * Fetch a drops category for Ethereum, then enrich with existing scanner data.
 *
 * - `recently_minted` has an official fallback (newest ETH collections) so it
 *   always returns real data even when the internal drops feed is unavailable.
 * - `upcoming` / `featured` rely on OpenSea's internal drops feed; if that is
 *   blocked/changed the category degrades to an empty "unavailable" result
 *   rather than erroring — the UI shows a clean message.
 */
export async function getDrops(category: DropCategory): Promise<DropsResult> {
  if (!env.opensea.apiKey) {
    return { category, chain: 'ethereum', items: [], source: 'unavailable', note: 'OPENSEA_API_KEY not configured.' };
  }

  const client = getOpenSeaClient();
  let items: DropItem[] = [];
  let source: DropsResult['source'] = 'unavailable';
  let note: string | undefined;

  // Primary: OpenSea internal drops feed (best-effort; may be unavailable).
  try {
    const raw = await client.getDrops(category);
    items = parseDrops(raw, category);
    if (items.length > 0) source = 'opensea-drops';
  } catch (err) {
    logger.warn('drops.feed_unavailable', { category, error: String(err) });
  }

  // Fallback for recently_minted: newest Ethereum collections from the official API.
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

  if (items.length === 0 && !note) {
    note =
      category === 'recently_minted'
        ? 'No recent Ethereum collections returned.'
        : "OpenSea's drops feed is unavailable (it is not part of the official public API).";
  }

  const enriched = await enrichWithScanner(items);
  logger.info('drops.fetched', { category, count: enriched.length, source });
  return { category, chain: 'ethereum', items: enriched, source, note };
}

/**
 * Attach existing scanner metrics (floor, best bid, 24h volume, offer→floor
 * spread, score) when we already track the collection. Reuses the latest
 * MarketSnapshot/Opportunity — it does NOT run the scanner or duplicate logic.
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
