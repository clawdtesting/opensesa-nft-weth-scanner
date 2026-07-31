import { listOpportunities } from '@/services/opportunities';
import { OpportunitiesTable } from '@/components/OpportunitiesTable';
import { ScanButton } from '@/components/ScanButton';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  const rows = await listOpportunities();
  const passing = rows.filter((r) => r.passesFilter).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-terminal-text">Opportunities</h1>
          <p className="text-xs text-terminal-muted mt-1">
            Ranked by risk-adjusted expected return on deployed WETH — not raw floor/bid spread.
            {' '}
            {passing} of {rows.length} pass strategy filters.
          </p>
        </div>
        <ScanButton />
      </div>
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <OpportunitiesTable rows={rows} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-terminal-border rounded p-8 text-sm text-terminal-muted">
      <p className="mb-2">No opportunities yet.</p>
      <p>
        Seed synthetic data with <code className="text-terminal-accent">npm run db:seed</code>, or run a live
        scan (requires <code className="text-terminal-accent">OPENSEA_API_KEY</code>) with the Scan button or{' '}
        <code className="text-terminal-accent">npm run scan</code>.
      </p>
    </div>
  );
}
