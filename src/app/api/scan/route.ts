import { NextResponse } from 'next/server';
import { runScan } from '@/services/scan';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';
// 60s works on every Vercel plan (Hobby caps at 60; Pro/Ent allow more). A live
// scan is bounded (see the default limit below) so it finishes within this.
export const maxDuration = 60;

// Keep a single interactive scan small enough to complete inside the function
// timeout. Larger sweeps should run from the CLI (`npm run scan`) or a cron job.
const DEFAULT_SCAN_LIMIT = 12;

/** POST /api/scan — run a bounded discovery→ingest→snapshot→rank cycle. */
export async function POST(request: Request) {
  if (!env.opensea.apiKey) {
    return NextResponse.json(
      { error: 'OPENSEA_API_KEY is not configured. Set it server-side to run live scans.' },
      { status: 400 },
    );
  }
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_SCAN_LIMIT;
    const result = await runScan({ limit });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scan failed' },
      { status: 500 },
    );
  }
}
