import { NextResponse } from 'next/server';
import { executeFloorBuy } from '@/services/buyer';
import { env } from '@/config/env';
import { ADDRESS_RE } from '@/services/snipe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/snipe/buy  { contract, chain?, maxPriceEth }
 * Buys the current floor NFT of the collection, capped at maxPriceEth.
 * Requires PRIVATE_KEY + RPC_URL. Never returns wallet secrets.
 */
export async function POST(request: Request) {
  let body: { contract?: string; chain?: string; maxPriceEth?: number; orderHash?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const contract = (body.contract ?? '').trim();
  const chain = body.chain || env.opensea.chain;
  const maxPriceEth = Number(body.maxPriceEth);

  if (!ADDRESS_RE.test(contract)) {
    return NextResponse.json({ ok: false, error: 'Invalid contract address.' }, { status: 400 });
  }

  const orderHash = typeof body.orderHash === 'string' ? body.orderHash : undefined;

  try {
    const result = await executeFloorBuy(contract, chain, maxPriceEth, orderHash);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Buy failed' },
      { status: 500 },
    );
  }
}
