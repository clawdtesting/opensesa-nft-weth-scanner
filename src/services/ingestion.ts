import 'server-only';
import { prisma } from '@/lib/db';
import { getOpenSeaClient } from '@/lib/opensea/client';
import { parseSaleEvent, saleEventId, parseListing, parseOffer } from '@/lib/opensea/parse';
import { logger } from '@/lib/logger';
import type { SaleRecord, ListingRecord, OfferRecord } from '@/domain/types';

const DAY = 86_400;

/**
 * Ingest raw market data for a single collection: sales events, best listings
 * and collection offers. Persists deduplicated rows and returns normalised
 * domain records for immediate analysis.
 */
export async function ingestCollection(slug: string): Promise<{
  collectionId: string;
  sales: SaleRecord[];
  listings: ListingRecord[];
  offers: OfferRecord[];
}> {
  const collection = await prisma.collection.findUnique({ where: { slug } });
  if (!collection) throw new Error(`Collection not found: ${slug}`);

  const client = getOpenSeaClient();
  const nowSec = Math.floor(Date.now() / 1000);

  // ---- Sales (last 7 days) ---------------------------------------------
  // Page depth is bounded so a live scan stays well within a serverless
  // function timeout; 5 pages × 50 = up to 250 recent sales, ample for the
  // 1h/6h/24h velocity windows and 7d volume.
  const rawEvents = await client.collectEvents(
    slug,
    { eventType: ['sale'], after: nowSec - 7 * DAY, limit: 50 },
    5,
  );
  const sales: SaleRecord[] = [];
  for (const ev of rawEvents) {
    const parsed = parseSaleEvent(ev);
    if (!parsed) continue;
    sales.push(parsed);
    const eventId = saleEventId(ev);
    // Deterministic dedup via unique eventId.
    await prisma.sale
      .upsert({
        where: { eventId },
        create: {
          collectionId: collection.id,
          tokenId: parsed.tokenId,
          eventId,
          transactionHash: ev.transaction ?? null,
          buyer: parsed.buyer,
          seller: parsed.seller,
          priceEth: parsed.priceEth,
          currency: parsed.currency,
          fromAcceptedOffer: parsed.fromAcceptedOffer,
          timestamp: parsed.timestamp,
        },
        update: {},
      })
      .catch((err) => logger.warn('ingest.sale_upsert_failed', { slug, error: String(err) }));
  }

  // ---- Listings (cheapest) ---------------------------------------------
  const rawListings = await client.collectBestListings(slug, 2, 100);
  const listings: ListingRecord[] = [];
  // Mark previous listings inactive; we rewrite the current book each scan.
  await prisma.listing.updateMany({ where: { collectionId: collection.id }, data: { active: false } });
  for (const l of rawListings) {
    const parsed = parseListing(l);
    if (!parsed) continue;
    listings.push(parsed);
    await prisma.listing
      .upsert({
        where: { orderHash: l.order_hash },
        create: {
          collectionId: collection.id,
          tokenId: parsed.tokenId ?? null,
          orderHash: l.order_hash,
          priceEth: parsed.priceEth,
          currency: parsed.currency,
          endTime: parsed.endTime,
          active: true,
        },
        update: { priceEth: parsed.priceEth, active: true, endTime: parsed.endTime },
      })
      .catch((err) => logger.warn('ingest.listing_upsert_failed', { slug, error: String(err) }));
  }

  // ---- Offers (collection-wide WETH bids) ------------------------------
  const rawOffers = await client.collectCollectionOffers(slug, 2, 100);
  const offers: OfferRecord[] = [];
  await prisma.offer.updateMany({ where: { collectionId: collection.id }, data: { active: false } });
  for (const o of rawOffers) {
    const parsed = parseOffer(o);
    if (!parsed) continue;
    offers.push(parsed);
    await prisma.offer
      .upsert({
        where: { orderHash: o.order_hash },
        create: {
          collectionId: collection.id,
          tokenId: parsed.tokenId,
          orderHash: o.order_hash,
          offerer: parsed.offerer,
          priceEth: parsed.priceEth,
          currency: parsed.currency,
          quantity: parsed.quantity,
          offerType: parsed.offerType,
          expiration: parsed.expiration,
          active: true,
        },
        update: { priceEth: parsed.priceEth, active: true, expiration: parsed.expiration },
      })
      .catch((err) => logger.warn('ingest.offer_upsert_failed', { slug, error: String(err) }));
  }

  logger.info('ingest.done', {
    slug,
    sales: sales.length,
    listings: listings.length,
    offers: offers.length,
  });

  return { collectionId: collection.id, sales, listings, offers };
}
