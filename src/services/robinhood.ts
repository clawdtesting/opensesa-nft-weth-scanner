import 'server-only';
import { getOpenSeaClient } from '@/lib/opensea/client';
import { parseSaleEvent } from '@/lib/opensea/parse';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import type { RobinhoodCollection } from '@/domain/types';

export interface RobinhoodResult {
  chain: string;
  items: RobinhoodCollection[];
  source: 'live' | 'cache' | 'unavailable';
  note?: string;
  lastRefreshAt: string | null;
}

/** How many newest collections to pull + enrich per refresh. */
const DISCOVERY_LIMIT = 24;
/** Cached results are served instantly until this many ms have elapsed. */
const CACHE_TTL_MS = 5 * 60_000;
/** Cap event pagination when summing 96h volume (best-effort, bounds cost). */
const EVENT_MAX_PAGES = 3;
const HOUR_MS = 3_600_000;

// In-memory cache. Serverless instances are short-lived, so this simply avoids
// re-fetching on rapid successive loads within a single instance; it is not a
// durable store (unlike the Drops DB snapshot).
let cache: { at: number; result: RobinhoodResult } | null = null;

/** Cached read — refreshes only when the cache is missing or stale. */
export async function getRobinhoodCached(): Promise<RobinhoodResult> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.result, source: 'cache' };
  }
  return refreshRobinhood();
}

/** Force a live fetch from OpenSea and repopulate the cache. */
export async function refreshRobinhood(): Promise<RobinhoodResult> {
  if (!env.opensea.apiKey) {
    return {
      chain: env.robinhoodChain,
      items: [],
      source: 'unavailable',
      note: 'OPENSEA_API_KEY not configured.',
      lastRefreshAt: null,
    };
  }

  const client = getOpenSeaClient();

  let listItems;
  try {
    const page = await client.listCollections({
      chain: env.robinhoodChain,
      orderBy: 'created_date',
      limit: DISCOVERY_LIMIT,
    });
    listItems = page.collections ?? [];
  } catch (err) {
    logger.warn('robinhood.list_failed', { chain: env.robinhoodChain, error: String(err) });
    // Serve a stale cache rather than an empty page if we have one.
    if (cache) return { ...cache.result, source: 'cache', note: `Live fetch failed: ${String(err)}` };
    return {
      chain: env.robinhoodChain,
      items: [],
      source: 'unavailable',
      note: `Could not load collections for chain "${env.robinhoodChain}". Set ROBINHOOD_CHAIN to a valid OpenSea chain identifier.`,
      lastRefreshAt: null,
    };
  }

  // Preserve OpenSea's created_date ordering (newest first).
  const items = await Promise.all(listItems.map((c) => enrich(c)));

  const result: RobinhoodResult = {
    chain: env.robinhoodChain,
    items,
    source: 'live',
    note: items.length === 0 ? `No collections returned for chain "${env.robinhoodChain}".` : undefined,
    lastRefreshAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), result };
  logger.info('robinhood.refreshed', { chain: env.robinhoodChain, count: items.length });
  return result;
}

// ---------------------------------------------------------------------------
// Per-collection enrichment
// ---------------------------------------------------------------------------

type ListItem = { collection: string; name?: string; image_url?: string; contracts?: Array<{ address: string; chain: string }> };

async function enrich(c: ListItem): Promise<RobinhoodCollection> {
  const slug = c.collection;
  const base: RobinhoodCollection = {
    slug,
    name: c.name ?? slug,
    chain: env.robinhoodChain,
    imageUrl: c.image_url ?? null,
    contract: c.contracts?.[0]?.address ?? null,
    openseaUrl: `https://opensea.io/collection/${slug}`,
    holders: null,
    itemCount: null,
    floorEth: null,
    volume24hEth: null,
    volume96hEth: null,
    totalVolumeEth: null,
  };

  const client = getOpenSeaClient();

  const [stats, supply, vol96h] = await Promise.all([
    client
      .getCollectionStats(slug)
      .catch((err) => {
        logger.warn('robinhood.stats_failed', { slug, error: String(err) });
        return null;
      }),
    client
      .getCollection(slug)
      .then((col) => col.total_supply ?? null)
      .catch((err) => {
        logger.warn('robinhood.collection_failed', { slug, error: String(err) });
        return null;
      }),
    volume96h(slug).catch((err) => {
      logger.warn('robinhood.volume96h_failed', { slug, error: String(err) });
      return null;
    }),
  ]);

  if (stats?.total) {
    base.holders = stats.total.num_owners ?? null;
    base.floorEth = stats.total.floor_price ?? null;
    base.totalVolumeEth = stats.total.volume ?? null;
  }
  const oneDay = stats?.intervals?.find((i) => i.interval === 'one_day');
  base.volume24hEth = oneDay ? oneDay.volume : null;
  base.itemCount = supply;
  base.volume96hEth = vol96h;

  return base;
}

/**
 * Sum ETH-denominated sale volume over the trailing 96h from the events feed.
 * Best-effort and page-capped — brand-new collections have little history, so a
 * few pages cover the window; older/busier ones may be under-counted.
 */
async function volume96h(slug: string): Promise<number | null> {
  const client = getOpenSeaClient();
  const afterSec = Math.floor((Date.now() - 96 * HOUR_MS) / 1000);
  const events = await client.collectEvents(
    slug,
    { eventType: ['sale'], after: afterSec },
    EVENT_MAX_PAGES,
  );
  const cutoff = Date.now() - 96 * HOUR_MS;
  let total = 0;
  let counted = 0;
  for (const ev of events) {
    const sale = parseSaleEvent(ev);
    if (!sale || sale.timestamp.getTime() < cutoff) continue;
    total += sale.priceEth;
    counted += 1;
  }
  return counted > 0 ? total : 0;
}
