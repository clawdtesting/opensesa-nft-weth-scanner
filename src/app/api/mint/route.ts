import { NextResponse } from 'next/server';
import { executeMint } from '@/services/minter';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/mint { contract, signature, quantity, valueEth } — mint an NFT. */
export async function POST(request: Request) {
  let body: { contract?: string; signature?: string; quantity?: number; valueEth?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }
  if (!body.contract || !body.signature) {
    return NextResponse.json({ ok: false, error: 'contract and signature are required.' }, { status: 400 });
  }
  try {
    const result = await executeMint({
      contract: body.contract,
      signature: body.signature,
      quantity: Number(body.quantity) || 1,
      valueEth: body.valueEth ?? '0',
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Mint failed' }, { status: 500 });
  }
}
