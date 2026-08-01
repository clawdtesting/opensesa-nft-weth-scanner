import { NextResponse } from 'next/server';
import { ingestCollection } from '@/services/ingestion';
import { buildSnapshot, rerankOpportunities } from '@/services/snapshot';
import { getOpportunityRow } from '@/services/opportunities';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/collections/{slug}/refresh — re-ingest one collection's sales,
 * listings and offers, rebuild its snapshot, and return the updated row. Cheap
 * (single collection) so it comfortably fits the serverless timeout.
 */
export async function POST(_request: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  if (!env.opensea.apiKey) {
    return NextResponse.json(
      { error: 'OPENSEA_API_KEY is not configured. Set it server-side to refresh live prices.' },
      { status: 400 },
    );
  }
  try {
    const { collectionId, sales, listings, offers } = await ingestCollection(slug);
    await buildSnapshot({ collectionId, sales, listings, offers });
    await rerankOpportunities();
    const row = await getOpportunityRow(slug);
    if (!row) return NextResponse.json({ error: 'No data after refresh' }, { status: 404 });
    return NextResponse.json({ row });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Refresh failed' },
      { status: 500 },
    );
  }
}
