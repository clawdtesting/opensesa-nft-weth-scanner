import { NextResponse } from 'next/server';
import { inspectContracts } from '@/services/inspect';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/inspect?addresses=0x..,0x..,..
 * Classify each address (token / pool / router / factory / EOA) using bytecode
 * fingerprints + Blockscout's verified ABI. RPC reads only.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('addresses') ?? '';
  const addresses = raw.split(',').map((s) => s.trim()).filter(Boolean);
  try {
    return NextResponse.json({ results: await inspectContracts(addresses) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Inspect failed' },
      { status: 500 },
    );
  }
}
