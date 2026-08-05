import { NextResponse } from 'next/server';
import { fetchTarget } from '@/services/snipe';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/snipe?contract=0x...&chain=ethereum
 * Resolve a pasted contract address to its OpenSea collection + live floor.
 * Never returns wallet secrets — only an `executorReady` boolean.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const contract = url.searchParams.get('contract') ?? '';
  const chain = url.searchParams.get('chain') || env.opensea.chain;

  try {
    const target = await fetchTarget(contract, chain);
    return NextResponse.json(target);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch target' },
      { status: 500 },
    );
  }
}
