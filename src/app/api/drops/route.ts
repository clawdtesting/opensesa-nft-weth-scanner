import { NextResponse } from 'next/server';
import { getDrops } from '@/services/drops';
import type { DropCategory } from '@/domain/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const VALID: DropCategory[] = ['upcoming', 'featured', 'recently_minted'];

/** GET /api/drops?type=upcoming|featured|recently_minted — Ethereum drops. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const typeParam = (url.searchParams.get('type') ?? 'upcoming') as DropCategory;
  const type = VALID.includes(typeParam) ? typeParam : 'upcoming';

  try {
    const result = await getDrops(type);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch drops' },
      { status: 500 },
    );
  }
}
