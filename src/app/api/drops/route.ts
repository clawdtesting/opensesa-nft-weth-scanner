import { NextResponse } from 'next/server';
import { getDropsCached, refreshDrops } from '@/services/drops';
import type { DropCategory } from '@/domain/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const VALID: DropCategory[] = ['upcoming', 'featured', 'recently_minted'];

/**
 * GET /api/drops?type=upcoming|featured|recently_minted[&refresh=1]
 * Default: instant cached read from the DB snapshot. `refresh=1` forces a live
 * OpenSea fetch and updates the snapshot.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const typeParam = (url.searchParams.get('type') ?? 'upcoming') as DropCategory;
  const type = VALID.includes(typeParam) ? typeParam : 'upcoming';
  const refresh = url.searchParams.get('refresh') === '1';

  try {
    const result = refresh ? await refreshDrops(type) : await getDropsCached(type);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch drops' },
      { status: 500 },
    );
  }
}
