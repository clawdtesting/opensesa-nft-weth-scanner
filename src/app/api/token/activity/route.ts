import { NextResponse } from 'next/server';
import { getTokenActivity } from '@/services/token';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/token/activity?address=0x...
 * Watch a token: deployment, whether trading has started (first transfer),
 * and the transfer (transaction) count. RPC reads only.
 */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address') ?? '';
  try {
    return NextResponse.json(await getTokenActivity(address));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read activity' },
      { status: 500 },
    );
  }
}
