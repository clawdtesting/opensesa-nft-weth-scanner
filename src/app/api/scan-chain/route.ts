import { NextResponse } from 'next/server';
import { scanNewContracts } from '@/services/chainScan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/scan-chain?blocks=10000
 * Scans recent blocks on Robinhood chain for newly-minting NFT & token
 * contracts. RPC reads only — no wallet key required.
 */
export async function GET(request: Request) {
  const blocks = Number(new URL(request.url).searchParams.get('blocks')) || undefined;
  try {
    return NextResponse.json(await scanNewContracts(blocks));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Chain scan failed' },
      { status: 500 },
    );
  }
}
