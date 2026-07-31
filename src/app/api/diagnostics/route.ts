import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOpenSeaClient } from '@/lib/opensea/client';
import { logger } from '@/lib/logger';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

/** GET /api/diagnostics — API health, ingest counts and recent logs. */
export async function GET() {
  const [collections, sales, listings, offers, snapshots, opportunities] = await Promise.all([
    prisma.collection.count(),
    prisma.sale.count(),
    prisma.listing.count({ where: { active: true } }),
    prisma.offer.count({ where: { active: true } }),
    prisma.marketSnapshot.count(),
    prisma.opportunity.count(),
  ]);

  const client = getOpenSeaClient();
  return NextResponse.json({
    openseaConfigured: Boolean(env.opensea.apiKey),
    chain: env.opensea.chain,
    apiMetrics: client.metrics,
    counts: { collections, sales, listings, offers, snapshots, opportunities },
    logs: logger.recent(80),
  });
}
