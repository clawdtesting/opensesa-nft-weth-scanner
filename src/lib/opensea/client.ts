import 'server-only';
import { env, assertOpenseaConfigured } from '@/config/env';
import { RateLimiter, sleep } from './rateLimiter';
import { logger } from '@/lib/logger';
import type {
  OSCollection,
  OSCollectionStats,
  OSCollectionsResponse,
  OSEventsResponse,
  OSEvent,
  OSListingsResponse,
  OSListing,
  OSOffersResponse,
  OSOffer,
} from './types';

interface RequestOptions {
  /** TTL for caching the response, in ms. 0 disables caching. */
  cacheTtlMs?: number;
  signal?: AbortSignal;
}

interface CacheEntry {
  expires: number;
  value: unknown;
}

/** Lightweight request/health metrics exposed to the diagnostics view. */
export interface ClientMetrics {
  requests: number;
  cacheHits: number;
  rateLimitHits: number;
  errors: number;
  retries: number;
  lastStatus: number | null;
  lastError: string | null;
}

export class OpenSeaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly chain: string;
  private readonly limiter: RateLimiter;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  readonly metrics: ClientMetrics = {
    requests: 0,
    cacheHits: 0,
    rateLimitHits: 0,
    errors: 0,
    retries: 0,
    lastStatus: null,
    lastError: null,
  };

  constructor(opts?: { apiKey?: string; baseUrl?: string; chain?: string; maxRps?: number }) {
    this.baseUrl = (opts?.baseUrl ?? env.opensea.baseUrl).replace(/\/$/, '');
    this.apiKey = opts?.apiKey ?? env.opensea.apiKey;
    this.chain = opts?.chain ?? env.opensea.chain;
    this.limiter = new RateLimiter(opts?.maxRps ?? env.opensea.maxRps);
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  /** Core request with rate limiting, caching, request de-dup and 429/5xx retry. */
  private async request<T>(
    path: string,
    query: Record<string, string | number | undefined> | undefined,
    options: RequestOptions = {},
  ): Promise<T> {
    assertOpenseaConfigured();
    const url = this.buildUrl(path, query);
    const ttl = options.cacheTtlMs ?? 0;

    if (ttl > 0) {
      const hit = this.cache.get(url);
      if (hit && hit.expires > Date.now()) {
        this.metrics.cacheHits += 1;
        return hit.value as T;
      }
    }

    // De-duplicate concurrent identical requests.
    const existing = this.inflight.get(url);
    if (existing) return existing as Promise<T>;

    const promise = this.execute<T>(url, options).finally(() => this.inflight.delete(url));
    this.inflight.set(url, promise);
    const value = await promise;

    if (ttl > 0) this.cache.set(url, { expires: Date.now() + ttl, value });
    return value;
  }

  private async execute<T>(url: string, options: RequestOptions): Promise<T> {
    const maxAttempts = 5;
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;
      await this.limiter.take();
      this.metrics.requests += 1;
      try {
        const res = await fetch(url, {
          headers: {
            'X-API-KEY': this.apiKey,
            Accept: 'application/json',
          },
          signal: options.signal,
        });
        this.metrics.lastStatus = res.status;

        if (res.status === 429) {
          this.metrics.rateLimitHits += 1;
          const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt;
          if (attempt >= maxAttempts) throw new Error('OpenSea 429: rate limit exceeded');
          this.metrics.retries += 1;
          logger.warn('opensea.rate_limited', { url, attempt, retryAfterSec: retryAfter });
          await sleep(retryAfter * 1000);
          continue;
        }

        if (res.status >= 500) {
          if (attempt >= maxAttempts) throw new Error(`OpenSea ${res.status}`);
          this.metrics.retries += 1;
          await sleep(Math.min(2 ** attempt * 500, 16_000));
          continue;
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`OpenSea ${res.status}: ${body.slice(0, 200)}`);
        }

        return (await res.json()) as T;
      } catch (err) {
        // Network errors: retry with backoff; otherwise rethrow.
        const message = err instanceof Error ? err.message : String(err);
        this.metrics.lastError = message;
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if (isAbort || attempt >= maxAttempts) {
          this.metrics.errors += 1;
          throw err;
        }
        this.metrics.retries += 1;
        await sleep(Math.min(2 ** attempt * 500, 16_000));
      }
    }
  }

  // ---- Endpoint wrappers ------------------------------------------------

  /** GET /collections/{slug} — metadata + fees (cached; changes slowly). */
  getCollection(slug: string): Promise<OSCollection> {
    return this.request<OSCollection>(`/collections/${slug}`, undefined, {
      cacheTtlMs: 60 * 60_000,
    });
  }

  /** GET /collections/{slug}/stats — aggregate stats (short cache). */
  getCollectionStats(slug: string): Promise<OSCollectionStats> {
    return this.request<OSCollectionStats>(`/collections/${slug}/stats`, undefined, {
      cacheTtlMs: 60_000,
    });
  }

  /** GET /collections?chain&order_by — one page of collection discovery. */
  listCollections(params: {
    orderBy?: 'market_cap' | 'seven_day_volume' | 'num_owners' | 'created_date';
    limit?: number;
    next?: string;
    /** Override the client's default chain (e.g. for the Robinhood feed). */
    chain?: string;
  } = {}): Promise<OSCollectionsResponse> {
    return this.request<OSCollectionsResponse>(
      '/collections',
      {
        chain: params.chain ?? this.chain,
        order_by: params.orderBy ?? 'seven_day_volume',
        limit: params.limit ?? 100,
        next: params.next,
      },
      { cacheTtlMs: 5 * 60_000 },
    );
  }

  /**
   * GET /drops?type=&chains= — OpenSea's drop/mint discovery feed.
   *
   * NOTE: this is NOT part of OpenSea's documented public API; it targets the
   * internal drops feed and may change or be blocked without notice. The
   * response is returned untyped and parsed defensively by dropsParse.ts, and
   * callers must treat failure as "unavailable" (never fatal). Ethereum-only is
   * requested here and re-enforced after parsing.
   */
  getDrops(type: string): Promise<unknown> {
    return this.request<unknown>(
      '/drops',
      { type, chains: this.chain },
      { cacheTtlMs: 60_000 },
    );
  }

  /** GET /events/collection/{slug} — one page of events (sales/orders). */
  getCollectionEvents(
    slug: string,
    params: { eventType?: string[]; after?: number; before?: number; limit?: number; next?: string } = {},
  ): Promise<OSEventsResponse> {
    const query: Record<string, string | number | undefined> = {
      limit: params.limit ?? 50,
      after: params.after,
      before: params.before,
      next: params.next,
    };
    // OpenSea accepts repeated event_type params; encode as comma-joined which
    // the API also tolerates, plus explicit repetition handled by caller if needed.
    if (params.eventType?.length) query.event_type = params.eventType.join(',');
    return this.request<OSEventsResponse>(`/events/collection/${slug}`, query);
  }

  /** GET /listings/collection/{slug}/best — cheapest active listings. */
  getBestListings(slug: string, params: { limit?: number; next?: string } = {}): Promise<OSListingsResponse> {
    return this.request<OSListingsResponse>(`/listings/collection/${slug}/best`, {
      limit: params.limit ?? 100,
      next: params.next,
    });
  }

  /** GET /offers/collection/{slug} — collection-wide (criteria) offers. */
  getCollectionOffers(slug: string, params: { limit?: number; next?: string } = {}): Promise<OSOffersResponse> {
    return this.request<OSOffersResponse>(`/offers/collection/${slug}`, {
      limit: params.limit ?? 100,
      next: params.next,
    });
  }

  // ---- Pagination helpers ----------------------------------------------

  /** Follow the `next` cursor across an events endpoint up to `maxPages`. */
  async collectEvents(
    slug: string,
    params: { eventType?: string[]; after?: number; before?: number; limit?: number },
    maxPages = 20,
  ): Promise<OSEvent[]> {
    const out: OSEvent[] = [];
    let next: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const res = await this.getCollectionEvents(slug, { ...params, next });
      out.push(...(res.asset_events ?? []));
      if (!res.next) break;
      next = res.next;
    }
    return out;
  }

  async collectBestListings(slug: string, maxPages = 5, perPage = 100): Promise<OSListing[]> {
    const out: OSListing[] = [];
    let next: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const res = await this.getBestListings(slug, { limit: perPage, next });
      out.push(...(res.listings ?? []));
      if (!res.next) break;
      next = res.next;
    }
    return out;
  }

  async collectCollectionOffers(slug: string, maxPages = 5, perPage = 100): Promise<OSOffer[]> {
    const out: OSOffer[] = [];
    let next: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const res = await this.getCollectionOffers(slug, { limit: perPage, next });
      out.push(...(res.offers ?? []));
      if (!res.next) break;
      next = res.next;
    }
    return out;
  }
}

let singleton: OpenSeaClient | null = null;
export function getOpenSeaClient(): OpenSeaClient {
  if (!singleton) singleton = new OpenSeaClient();
  return singleton;
}
