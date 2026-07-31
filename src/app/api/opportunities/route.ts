import { NextResponse } from 'next/server';
import { listOpportunities, type OpportunityFilters } from '@/services/opportunities';

export const dynamic = 'force-dynamic';

/** GET /api/opportunities — ranked opportunities with optional query filters. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams;
  const numParam = (k: string): number | undefined => {
    const v = q.get(k);
    return v === null ? undefined : Number(v);
  };
  const filters: OpportunityFilters = {
    minVolume24h: numParam('minVolume24h'),
    minSales24h: numParam('minSales24h'),
    minAcceptedOffers24h: numParam('minAcceptedOffers24h'),
    minRawSpread: numParam('minRawSpread'),
    minRoi: numParam('minRoi'),
    minScore: numParam('minScore'),
    floorMin: numParam('floorMin'),
    floorMax: numParam('floorMax'),
    chain: q.get('chain') ?? undefined,
    onlyPassing: q.get('onlyPassing') === 'true',
  };
  const rows = await listOpportunities(filters);
  return NextResponse.json({ count: rows.length, opportunities: rows });
}
