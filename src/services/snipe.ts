import 'server-only';
import { getOpenSeaClient } from '@/lib/opensea/client';
import { parseListing, parseOffer } from '@/lib/opensea/parse';
import { buyerReady } from '@/config/env';
import { logger } from '@/lib/logger';
import type { SnipeTarget, FloorListing } from '@/domain/types';

/** Matches a 20-byte hex EVM address. */
export const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Resolve a pasted contract address to its OpenSea collection and current
 * floor listing. Designed to be re-run (polled) around a drop: if the contract
 * is not yet indexed or has no listings, it returns a target with nulls + a
 * note rather than throwing.
 */
export async function fetchTarget(contractRaw: string, chain: string): Promise<SnipeTarget> {
  const contract = contractRaw.trim();
  const base: SnipeTarget = {
    chain,
    contract,
    slug: null,
    name: null,
    imageUrl: null,
    openseaUrl: null,
    floorEth: null,
    bestListing: null,
    floorListings: [],
    bestOfferEth: null,
    executorReady: buyerReady(),
    fetchedAt: new Date().toISOString(),
  };

  if (!ADDRESS_RE.test(contract)) {
    return { ...base, note: 'Enter a valid contract address (0x followed by 40 hex characters).' };
  }

  const client = getOpenSeaClient();

  // 1) Contract -> collection slug. Before the drop this can 404.
  let slug: string | null = null;
  try {
    const c = await client.getContract(contract, chain);
    slug = c.collection ?? null;
    base.name = c.name ?? null;
  } catch (err) {
    logger.warn('snipe.contract_unresolved', { contract, chain, error: String(err) });
    return {
      ...base,
      note: `No OpenSea collection found for this contract on "${chain}" yet. It may not be indexed until the drop goes live — keep fetching.`,
    };
  }

  if (!slug) {
    return { ...base, note: 'Contract is indexed but not attached to a collection yet.' };
  }
  base.slug = slug;
  base.openseaUrl = `https://opensea.io/collection/${slug}`;

  // 2) Collection metadata (name + image) — best-effort.
  try {
    const col = await client.getCollection(slug);
    base.name = col.name ?? base.name;
    base.imageUrl = col.image_url ?? null;
  } catch (err) {
    logger.warn('snipe.collection_meta_failed', { slug, error: String(err) });
  }

  // 3) Cheapest active listings = the floor (top 10, ascending by price).
  try {
    const res = await client.getBestListings(slug, { limit: 10 });
    const parsed = (res.listings ?? [])
      .map((l): FloorListing | null => {
        const p = parseListing(l);
        if (!p) return null;
        return {
          orderHash: l.order_hash,
          priceEth: p.priceEth,
          currency: p.currency,
          protocolAddress: l.protocol_address ?? null,
          tokenId: p.tokenId ?? null,
        };
      })
      .filter((x): x is FloorListing => x !== null)
      .sort((a, b) => a.priceEth - b.priceEth);

    base.floorListings = parsed;
    base.bestListing = parsed[0] ?? null;
    base.floorEth = parsed[0]?.priceEth ?? null;
    if (parsed.length === 0) {
      base.note = 'Collection found — no active listings yet. Floor appears once someone lists.';
    }
  } catch (err) {
    logger.warn('snipe.listings_failed', { slug, error: String(err) });
    base.note = 'Collection found, but listings could not be loaded right now.';
  }

  // 4) Highest collection-wide offer = the best bid (per item).
  try {
    const res = await client.getCollectionOffers(slug, { limit: 100 });
    let best: number | null = null;
    for (const offer of res.offers ?? []) {
      const parsed = parseOffer(offer);
      if (parsed && (best === null || parsed.priceEth > best)) best = parsed.priceEth;
    }
    base.bestOfferEth = best;
  } catch (err) {
    logger.warn('snipe.offers_failed', { slug, error: String(err) });
  }

  return base;
}
