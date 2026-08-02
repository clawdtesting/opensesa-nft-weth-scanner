import { NextResponse } from 'next/server';
import { getRobinhoodCached, refreshRobinhood } from '@/services/robinhood';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/robinhood[?refresh=1]
 * Newly minted collections on the Robinhood chain, enriched with holders,
 * item count and 24h/96h volume. Default read is served from an in-memory
 * cache; `refresh=1` forces a live OpenSea fetch. Filtering is done client-side.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get('refresh') === '1';

  try {
    const result = refresh ? await refreshRobinhood() : await getRobinhoodCached();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch Robinhood collections' },
      { status: 500 },
    );
  }
}
