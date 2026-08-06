import { NextResponse } from 'next/server';
import { getTokenInfo } from '@/services/token';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/** GET /api/token?address=0x... — token metadata + the wallet's balance. */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address') ?? '';
  try {
    return NextResponse.json(await getTokenInfo(address));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read token' },
      { status: 500 },
    );
  }
}
