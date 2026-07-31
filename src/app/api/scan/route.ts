import { NextResponse } from 'next/server';
import { runScan } from '@/services/scan';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** POST /api/scan — run a full discovery→ingest→snapshot→rank cycle. */
export async function POST(request: Request) {
  if (!env.opensea.apiKey) {
    return NextResponse.json(
      { error: 'OPENSEA_API_KEY is not configured. Set it server-side to run live scans.' },
      { status: 400 },
    );
  }
  try {
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit');
    const result = await runScan({ limit: limit ? Number(limit) : undefined });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scan failed' },
      { status: 500 },
    );
  }
}
