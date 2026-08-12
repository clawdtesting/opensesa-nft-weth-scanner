import { NextResponse } from 'next/server';
import { detectMint } from '@/services/minter';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** GET /api/mint/detect?address=0x... — candidate mint fns, price, supply. */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address') ?? '';
  try {
    return NextResponse.json(await detectMint(address));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Detect failed' }, { status: 500 });
  }
}
