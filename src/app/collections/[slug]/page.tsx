import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCollectionDetail } from '@/services/opportunities';
import { formatEth, formatPct } from '@/lib/money';

export const dynamic = 'force-dynamic';

interface ScoreDetail {
  components?: Record<string, number>;
  weightedComponents?: Record<string, number>;
  riskPenalties?: Array<{ reason: string; points: number }>;
  reason?: string;
  realisticExit?: { explanation?: string };
  recommendedBid?: { explanation?: string };
}

export default async function CollectionPage({ params }: { params: { slug: string } }) {
  const data = await getCollectionDetail(params.slug);
  if (!data) notFound();
  const { collection, snapshot, opportunity, sales, listings, offers } = data;
  const detail = (snapshot?.scoreDetail as ScoreDetail | null) ?? null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Link href="/" className="text-terminal-muted text-xs hover:text-terminal-text">
          ← Opportunities
        </Link>
      </div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">{collection.name}</h1>
        <div className="text-right">
          <div className="text-2xl">{opportunity ? opportunity.score.toFixed(0) : '—'}</div>
          <div className="text-[10px] uppercase tracking-wide text-terminal-muted">Opportunity score</div>
        </div>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <Metric label="Floor" value={`${formatEth(snapshot?.floor)}`} />
        <Metric label="Realistic Exit" value={`${formatEth(snapshot?.realisticExit)}`} />
        <Metric label="Best Bid" value={`${formatEth(snapshot?.bestBid)}`} />
        <Metric label="Suggested Bid" value={`${formatEth(snapshot?.recommendedBid)}`} />
        <Metric
          label="Expected Profit"
          value={`${formatEth(snapshot?.expectedProfit)}`}
          cls={(snapshot?.expectedProfit ?? 0) >= 0 ? 'pos' : 'neg'}
        />
        <Metric
          label="Expected ROI"
          value={formatPct(snapshot?.expectedRoi)}
          cls={(snapshot?.expectedRoi ?? 0) >= 0 ? 'pos' : 'neg'}
        />
        <Metric label="Sales 24h" value={(snapshot?.sales24h ?? 0).toString()} />
        <Metric label="Accepted 24h" value={(snapshot?.acceptedOffers24h ?? 0).toString()} />
        <Metric label="Median concession" value={formatPct(snapshot?.medianSellerConcession)} />
        <Metric label="Floor ≤5%" value={(snapshot?.floorDepth5 ?? 0).toString()} />
        <Metric label="P(fill)" value={formatPct(snapshot?.fillProbability)} />
        <Metric label="P(exit 24h)" value={formatPct(snapshot?.exitProbability24h)} />
      </div>

      {/* Why this ranks + risks */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="border border-terminal-border rounded bg-terminal-panel p-4">
          <h3 className="text-xs uppercase tracking-wide text-terminal-muted mb-2">Why this ranks</h3>
          <pre className="text-xs text-terminal-text whitespace-pre-wrap font-mono">
            {detail?.reason || opportunity?.reason || 'No explanation available.'}
          </pre>
          {detail?.realisticExit?.explanation && (
            <p className="text-xs dim mt-3">Exit model: {detail.realisticExit.explanation}</p>
          )}
          {detail?.recommendedBid?.explanation && (
            <p className="text-xs dim mt-2">Bid: {detail.recommendedBid.explanation}</p>
          )}
        </div>
        <div className="border border-terminal-border rounded bg-terminal-panel p-4">
          <h3 className="text-xs uppercase tracking-wide text-terminal-muted mb-2">Risk penalties</h3>
          {detail?.riskPenalties && detail.riskPenalties.length > 0 ? (
            <ul className="text-xs space-y-1">
              {detail.riskPenalties.map((r, i) => (
                <li key={i} className="neg">
                  − {r.reason} (−{r.points})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs dim">No risk penalties triggered.</p>
          )}
          {detail?.components && (
            <div className="mt-3">
              <h4 className="text-[10px] uppercase tracking-wide text-terminal-muted mb-1">Score components</h4>
              <div className="grid grid-cols-2 gap-x-4 text-xs">
                {Object.entries(detail.components).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="dim">{k}</span>
                    <span className="num">{v.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Activity */}
      <div className="grid md:grid-cols-3 gap-4">
        <ActivityTable
          title="Recent Sales"
          headers={['Price', 'Type', 'When']}
          rows={sales.map((s) => [
            formatEth(s.priceEth),
            s.fromAcceptedOffer ? 'accepted' : 'listing',
            s.timestamp.toISOString().slice(5, 16).replace('T', ' '),
          ])}
        />
        <ActivityTable
          title="Cheapest Listings"
          headers={['Price', 'Token']}
          rows={listings.map((l) => [formatEth(l.priceEth), l.tokenId ?? '—'])}
        />
        <ActivityTable
          title="Top WETH Offers"
          headers={['Bid', 'Type', 'By']}
          rows={offers.map((o) => [
            formatEth(o.priceEth),
            o.offerType,
            o.offerer ? `${o.offerer.slice(0, 8)}…` : '—',
          ])}
        />
      </div>

      <p className="text-[11px] dim mt-6">
        Estimated profit is not guaranteed profit. Spreads can be stale, illiquid, or manipulated;
        fees, gas and slippage are modelled but real execution may differ. This tool does not execute
        trades.
      </p>
    </div>
  );
}

function Metric({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="border border-terminal-border rounded p-3 bg-terminal-panel">
      <div className="text-[10px] uppercase tracking-wide text-terminal-muted">{label}</div>
      <div className={`text-base mt-1 ${cls ?? ''}`}>{value}</div>
    </div>
  );
}

function ActivityTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="border border-terminal-border rounded overflow-hidden">
      <div className="px-3 py-2 text-xs uppercase tracking-wide text-terminal-muted bg-terminal-panel border-b border-terminal-border">
        {title}
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="terminal">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className={h === 'Price' || h === 'Bid' ? 'num' : ''}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={j === 0 ? 'num' : ''}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="dim" style={{ textAlign: 'center', padding: 16 }}>
                  none
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
