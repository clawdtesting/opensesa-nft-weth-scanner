import { prisma } from '@/lib/db';
import { getOpenSeaClient } from '@/lib/opensea/client';
import { logger } from '@/lib/logger';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

export default async function DiagnosticsPage() {
  const [collections, sales, listings, offers, snapshots, opportunities] = await Promise.all([
    prisma.collection.count(),
    prisma.sale.count(),
    prisma.listing.count({ where: { active: true } }),
    prisma.offer.count({ where: { active: true } }),
    prisma.marketSnapshot.count(),
    prisma.opportunity.count(),
  ]);
  const metrics = getOpenSeaClient().metrics;
  const logs = logger.recent(60);

  const counts = { collections, sales, listings, offers, snapshots, opportunities };

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">Diagnostics</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Panel title="OpenSea API">
          <Row label="Configured" value={env.opensea.apiKey ? 'yes' : 'no (seed/offline mode)'} />
          <Row label="Chain" value={env.opensea.chain} />
          <Row label="Requests" value={metrics.requests.toString()} />
          <Row label="Cache hits" value={metrics.cacheHits.toString()} />
          <Row label="429s" value={metrics.rateLimitHits.toString()} />
          <Row label="Retries" value={metrics.retries.toString()} />
          <Row label="Errors" value={metrics.errors.toString()} />
          <Row label="Last status" value={metrics.lastStatus?.toString() ?? '—'} />
        </Panel>
        <Panel title="Ingested data">
          {Object.entries(counts).map(([k, v]) => (
            <Row key={k} label={k} value={v.toString()} />
          ))}
        </Panel>
        <Panel title="Environment">
          <Row label="NODE_ENV" value={env.nodeEnv} />
          <Row label="Discovery limit" value={env.discoveryLimit.toString()} />
          <Row label="Max RPS" value={env.opensea.maxRps.toString()} />
          <Row label="Seed slugs" value={env.seedSlugs.length ? env.seedSlugs.join(', ') : '—'} />
        </Panel>
      </div>

      <h2 className="text-sm font-semibold mb-2">Recent activity</h2>
      <div className="border border-terminal-border rounded bg-terminal-panel p-3 max-h-96 overflow-auto text-xs">
        {logs.length === 0 && <p className="dim">No recent log entries.</p>}
        {logs.map((l, i) => (
          <div key={i} className="flex gap-3">
            <span className="dim">{l.ts.slice(11, 19)}</span>
            <span
              className={
                l.level === 'error' ? 'neg' : l.level === 'warn' ? 'text-terminal-amber' : 'dim'
              }
            >
              {l.level.toUpperCase()}
            </span>
            <span className="text-terminal-text">{l.event}</span>
            {l.data && <span className="dim">{JSON.stringify(l.data)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-terminal-border rounded bg-terminal-panel p-4">
      <h3 className="text-xs uppercase tracking-wide text-terminal-muted mb-2">{title}</h3>
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="dim">{label}</span>
      <span className="text-terminal-text">{value}</span>
    </div>
  );
}
