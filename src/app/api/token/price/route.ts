import { NextResponse } from 'next/server';
import { getTokenPrice } from '@/services/token';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

/** GET /api/token/price?address=0x... — a single live price sample (ETH/token). */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address') ?? '';
  try {
    return NextResponse.json(await getTokenPrice(address));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read price' },
      { status: 500 },
    );
  }
}
