import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getOpenSeaClient } from '@/lib/opensea/client';
import { parseSaleEvent, saleEventId, parseListing, parseOffer } from '@/lib/opensea/parse';
import { logger } from '@/lib/logger';
import type { SaleRecord, ListingRecord, OfferRecord } from '@/domain/types';

const DAY = 86_400;

/**
 * Ingest raw market data for a single collection: sales events, best listings
 * and collection offers. Writes are BATCHED (one round-trip each) rather than a
 * per-row upsert loop — critical when the database is a remote pooler, where
 * hundreds of sequential queries would blow past the serverless timeout.
 */
export async function ingestCollection(slug: string): Promise<{
  collectionId: string;
  sales: SaleRecord[];
  listings: ListingRecord[];
  offers: OfferRecord[];
}> {
  const collection = await prisma.collection.findUnique({ where: { slug } });
  if (!collection) throw new Error(`Collection not found: ${slug}`);
  const collectionId = collection.id;

  const client = getOpenSeaClient();
  const nowSec = Math.floor(Date.now() / 1000);

  // ---- Sales (last 7 days) ---------------------------------------------
  // 5 pages × 50 = up to 250 recent sales, ample for the velocity windows.
  const rawEvents = await client.collectEvents(
    slug,
    { eventType: ['sale'], after: nowSec - 7 * DAY, limit: 50 },
    5,
  );
  const sales: SaleRecord[] = [];
  const saleRows = new Map<string, Prisma.SaleCreateManyInput>();
  for (const ev of rawEvents) {
    const parsed = parseSaleEvent(ev);
    if (!parsed) continue;
    sales.push(parsed);
    const eventId = saleEventId(ev);
    if (saleRows.has(eventId)) continue;
    saleRows.set(eventId, {
      collectionId,
      tokenId: parsed.tokenId,
      eventId,
      transactionHash: ev.transaction ?? null,
      buyer: parsed.buyer,
      seller: parsed.seller,
      priceEth: parsed.priceEth,
      currency: parsed.currency,
      fromAcceptedOffer: parsed.fromAcceptedOffer,
      timestamp: parsed.timestamp,
    });
  }
  // Insert new sales in one round-trip; existing eventIds are skipped.
  if (saleRows.size > 0) {
    await prisma.sale
      .createMany({ data: [...saleRows.values()], skipDuplicates: true })
      .catch((err) => logger.warn('ingest.sales_createmany_failed', { slug, error: String(err) }));
  }

  // ---- Listings (cheapest) ---------------------------------------------
  const rawListings = await client.collectBestListings(slug, 2, 100);
  const listings: ListingRecord[] = [];
  const listingRows = new Map<string, Prisma.ListingCreateManyInput>();
  for (const l of rawListings) {
    const parsed = parseListing(l);
    if (!parsed) continue;
    listings.push(parsed);
    if (listingRows.has(l.order_hash)) continue;
    listingRows.set(l.order_hash, {
      collectionId,
      tokenId: parsed.tokenId ?? null,
      orderHash: l.order_hash,
      priceEth: parsed.priceEth,
      currency: parsed.currency,
      endTime: parsed.endTime,
      active: true,
    });
  }
  // Replace the current book atomically: drop old rows, insert the fresh set.
  await prisma
    .$transaction([
      prisma.listing.deleteMany({ where: { collectionId } }),
      prisma.listing.createMany({ data: [...listingRows.values()], skipDuplicates: true }),
    ])
    .catch((err) => logger.warn('ingest.listings_write_failed', { slug, error: String(err) }));

  // ---- Offers (collection-wide WETH bids) ------------------------------
  const rawOffers = await client.collectCollectionOffers(slug, 2, 100);
  const offers: OfferRecord[] = [];
  const offerRows = new Map<string, Prisma.OfferCreateManyInput>();
  for (const o of rawOffers) {
    const parsed = parseOffer(o);
    if (!parsed) continue;
    offers.push(parsed);
    if (offerRows.has(o.order_hash)) continue;
    offerRows.set(o.order_hash, {
      collectionId,
      tokenId: parsed.tokenId,
      orderHash: o.order_hash,
      offerer: parsed.offerer,
      priceEth: parsed.priceEth,
      currency: parsed.currency,
      quantity: parsed.quantity,
      offerType: parsed.offerType,
      expiration: parsed.expiration,
      active: true,
    });
  }
  await prisma
    .$transaction([
      prisma.offer.deleteMany({ where: { collectionId } }),
      prisma.offer.createMany({ data: [...offerRows.values()], skipDuplicates: true }),
    ])
    .catch((err) => logger.warn('ingest.offers_write_failed', { slug, error: String(err) }));

  logger.info('ingest.done', {
    slug,
    sales: sales.length,
    listings: listings.length,
    offers: offers.length,
  });

  return { collectionId, sales, listings, offers };
}
