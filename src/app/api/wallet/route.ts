import { NextResponse } from 'next/server';
import { getWalletBalances } from '@/services/wallet';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * GET /api/wallet — the configured wallet's ETH + WETH balances on Robinhood
 * chain. Returns only the public address and balances, never the private key.
 */
export async function GET() {
  try {
    return NextResponse.json(await getWalletBalances());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read wallet' },
      { status: 500 },
    );
  }
}
