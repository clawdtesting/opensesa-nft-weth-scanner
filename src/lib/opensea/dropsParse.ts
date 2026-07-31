import type { DropItem, DropCategory } from '@/domain/types';

/**
 * Defensive parser for OpenSea's (undocumented) drops feed.
 *
 * The internal feed's exact shape is not guaranteed, so we read tolerantly:
 * accept an array, or `{ drops }`, or `{ collections }`, and map a wide set of
 * plausible field names. Anything missing becomes null — we never fabricate a
 * value. Ethereum-only is enforced here regardless of what the server returned.
 */

const ETH_CHAINS = new Set(['ethereum', 'eth', 'mainnet']);

export function isEthereumChain(chain: unknown): boolean {
  return typeof chain === 'string' && ETH_CHAINS.has(chain.toLowerCase());
}

/** True if `now` is within [start, end] (open-ended when a bound is missing). */
export function computeIsLive(
  mintStart: string | null,
  mintEnd: string | null,
  now: Date = new Date(),
): boolean {
  const t = now.getTime();
  const start = mintStart ? Date.parse(mintStart) : NaN;
  const end = mintEnd ? Date.parse(mintEnd) : NaN;
  if (!Number.isNaN(start) && t < start) return false;
  if (!Number.isNaN(end) && t > end) return false;
  // Live only if we actually know a start has passed; unknown start => not live.
  return !Number.isNaN(start);
}

type Raw = Record<string, unknown>;

function asRecord(v: unknown): Raw | null {
  return v && typeof v === 'object' ? (v as Raw) : null;
}

function firstString(obj: Raw, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function firstNumber(obj: Raw, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/** Normalise a timestamp (ISO string, or unix seconds/ms) to an ISO string. */
function firstTimestamp(obj: Raw, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) {
      const parsed = Date.parse(v);
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      // Heuristic: <1e12 is seconds, else milliseconds.
      const ms = v < 1e12 ? v * 1000 : v;
      return new Date(ms).toISOString();
    }
  }
  return null;
}

function extractArray(raw: unknown): Raw[] {
  if (Array.isArray(raw)) return raw.map(asRecord).filter((x): x is Raw => x !== null);
  const rec = asRecord(raw);
  if (!rec) return [];
  for (const key of ['drops', 'collections', 'results', 'data', 'items']) {
    const v = rec[key];
    if (Array.isArray(v)) return v.map(asRecord).filter((x): x is Raw => x !== null);
  }
  return [];
}

function chainOf(item: Raw): string {
  // chain may be a string, or nested under contracts[0].chain / chain.identifier.
  const direct = firstString(item, ['chain', 'chain_identifier', 'chainIdentifier']);
  if (direct) return direct;
  const contracts = item['contracts'];
  if (Array.isArray(contracts) && contracts.length > 0) {
    const c = asRecord(contracts[0]);
    const ch = c ? firstString(c, ['chain']) : null;
    if (ch) return ch;
  }
  const chainObj = asRecord(item['chain']);
  if (chainObj) {
    const ch = firstString(chainObj, ['identifier', 'name']);
    if (ch) return ch;
  }
  return 'unknown';
}

function contractOf(item: Raw): string | null {
  const direct = firstString(item, ['contract', 'contract_address', 'address']);
  if (direct) return direct;
  const contracts = item['contracts'];
  if (Array.isArray(contracts) && contracts.length > 0) {
    const c = asRecord(contracts[0]);
    if (c) return firstString(c, ['address', 'contract']);
  }
  return null;
}

/** Parse + Ethereum-filter a raw drops response into normalised DropItems. */
export function parseDrops(raw: unknown, category: DropCategory, now: Date = new Date()): DropItem[] {
  const rows = extractArray(raw);
  const out: DropItem[] = [];

  for (const item of rows) {
    const chain = chainOf(item);
    // Enforce Ethereum-only regardless of server-side filtering.
    if (!isEthereumChain(chain)) continue;

    const slug = firstString(item, ['slug', 'collection', 'collection_slug']);
    if (!slug) continue;
    const name = firstString(item, ['name', 'title']) ?? slug;

    // Mint stage details may be nested under a `drop`/`stages` object.
    const drop = asRecord(item['drop']) ?? item;
    const stageObj =
      asRecord(drop['stage']) ??
      (Array.isArray(drop['stages']) ? asRecord(drop['stages'][0]) : null) ??
      drop;

    const mintStart = firstTimestamp(stageObj, [
      'start_time', 'startTime', 'mint_start', 'mintStart', 'start_date', 'startDate',
    ]);
    const mintEnd = firstTimestamp(stageObj, [
      'end_time', 'endTime', 'mint_end', 'mintEnd', 'end_date', 'endDate',
    ]);

    const item2: DropItem = {
      slug,
      name,
      chain: 'ethereum',
      imageUrl: firstString(item, ['image_url', 'imageUrl', 'image', 'banner_image_url']),
      contract: contractOf(item),
      openseaUrl:
        firstString(item, ['opensea_url', 'openseaUrl', 'url']) ??
        `https://opensea.io/collection/${slug}`,
      featured:
        category === 'featured' ||
        item['featured'] === true ||
        item['is_featured'] === true,
      mintPriceEth: firstNumber(stageObj, [
        'mint_price', 'mintPrice', 'price', 'price_eth', 'priceEth', 'public_mint_price',
      ]),
      mintCurrency: firstString(stageObj, ['currency', 'payment_token_symbol']) ?? 'ETH',
      mintStart,
      mintEnd,
      mintStage: firstString(stageObj, ['stage', 'stage_name', 'name', 'phase']),
      maxPerWallet: firstNumber(stageObj, [
        'max_per_wallet', 'maxPerWallet', 'per_wallet_limit', 'limit_per_wallet',
      ]),
      totalSupply: firstNumber(item, [
        'total_supply', 'totalSupply', 'max_supply', 'maxSupply', 'supply',
      ]),
      isLive: computeIsLive(mintStart, mintEnd, now),
    };
    out.push(item2);
  }

  return out;
}
