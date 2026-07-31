'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { OpportunityRow } from '@/services/opportunities';
import { formatEth, formatPct } from '@/lib/money';

type SortKey = keyof Pick<
  OpportunityRow,
  | 'rank'
  | 'score'
  | 'floor'
  | 'realisticExit'
  | 'bestBid'
  | 'recommendedBid'
  | 'rawSpread'
  | 'expectedProfit'
  | 'expectedRoi'
  | 'sales1h'
  | 'sales24h'
  | 'acceptedOffers24h'
  | 'floorDepth5'
  | 'fillProbability'
  | 'exitProbability24h'
  | 'estimatedHoldingHours'
  | 'capitalEfficiency'
>;

const COLUMNS: Array<{ key: SortKey; label: string; fmt: (r: OpportunityRow) => string; cls?: (r: OpportunityRow) => string }> = [
  { key: 'rank', label: 'Rank', fmt: (r) => (r.rank ?? '—').toString() },
  { key: 'floor', label: 'Floor', fmt: (r) => formatEth(r.floor) },
  { key: 'realisticExit', label: 'Real Exit', fmt: (r) => formatEth(r.realisticExit) },
  { key: 'bestBid', label: 'Best Bid', fmt: (r) => formatEth(r.bestBid) },
  { key: 'recommendedBid', label: 'Sugg. Bid', fmt: (r) => formatEth(r.recommendedBid) },
  { key: 'rawSpread', label: 'Raw Spr', fmt: (r) => formatPct(r.rawSpread) },
  {
    key: 'expectedProfit',
    label: 'Exp Profit',
    fmt: (r) => formatEth(r.expectedProfit),
    cls: (r) => ((r.expectedProfit ?? 0) >= 0 ? 'pos' : 'neg'),
  },
  {
    key: 'expectedRoi',
    label: 'Exp ROI',
    fmt: (r) => formatPct(r.expectedRoi),
    cls: (r) => ((r.expectedRoi ?? 0) >= 0 ? 'pos' : 'neg'),
  },
  { key: 'sales1h', label: 'Sales 1h', fmt: (r) => r.sales1h.toString() },
  { key: 'sales24h', label: 'Sales 24h', fmt: (r) => r.sales24h.toString() },
  { key: 'acceptedOffers24h', label: 'Acc.Off 24h', fmt: (r) => r.acceptedOffers24h.toString() },
  { key: 'floorDepth5', label: 'Floor≤5%', fmt: (r) => r.floorDepth5.toString() },
  { key: 'fillProbability', label: 'P(fill)', fmt: (r) => formatPct(r.fillProbability) },
  { key: 'exitProbability24h', label: 'P(exit)', fmt: (r) => formatPct(r.exitProbability24h) },
  { key: 'estimatedHoldingHours', label: 'Hold h', fmt: (r) => (r.estimatedHoldingHours ? r.estimatedHoldingHours.toFixed(0) : '—') },
  {
    key: 'capitalEfficiency',
    label: 'Cap.Eff',
    fmt: (r) => (r.capitalEfficiency != null ? (r.capitalEfficiency * 1e6).toFixed(2) : '—'),
  },
  { key: 'score', label: 'Score', fmt: (r) => r.score.toFixed(1) },
];

export function OpportunitiesTable({ rows }: { rows: OpportunityRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [asc, setAsc] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [minSales, setMinSales] = useState(0);
  const [minAccepted, setMinAccepted] = useState(0);
  const [minRoi, setMinRoi] = useState(0);
  const [floorMin, setFloorMin] = useState(0);
  const [floorMax, setFloorMax] = useState(0); // 0 = no upper limit
  const [onlyPassing, setOnlyPassing] = useState(false);

  const filtered = useMemo(() => {
    const out = rows.filter(
      (r) =>
        r.score >= minScore &&
        r.sales24h >= minSales &&
        r.acceptedOffers24h >= minAccepted &&
        (r.expectedRoi ?? -Infinity) >= minRoi / 100 &&
        (r.floor ?? 0) >= floorMin &&
        (floorMax <= 0 || (r.floor ?? Infinity) <= floorMax) &&
        (!onlyPassing || r.passesFilter),
    );
    out.sort((a, b) => {
      const av = (a[sortKey] ?? -Infinity) as number;
      const bv = (b[sortKey] ?? -Infinity) as number;
      return asc ? av - bv : bv - av;
    });
    return out;
  }, [rows, sortKey, asc, minScore, minSales, minAccepted, minRoi, floorMin, floorMax, onlyPassing]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4 mb-4 text-xs">
        <FilterNum label="Min score" value={minScore} setValue={setMinScore} step={5} />
        <FilterNum label="Min sales 24h" value={minSales} setValue={setMinSales} step={1} />
        <FilterNum label="Min accepted 24h" value={minAccepted} setValue={setMinAccepted} step={1} />
        <FilterNum label="Min ROI %" value={minRoi} setValue={setMinRoi} step={1} />
        <FilterNum label="Floor min (Ξ)" value={floorMin} setValue={setFloorMin} step={0.1} />
        <FilterNum label="Floor max (Ξ, 0=∞)" value={floorMax} setValue={setFloorMax} step={0.1} />
        <label className="flex items-center gap-2 text-terminal-muted">
          <input type="checkbox" checked={onlyPassing} onChange={(e) => setOnlyPassing(e.target.checked)} />
          only passing filters
        </label>
        <span className="ml-auto text-terminal-muted">{filtered.length} collections</span>
      </div>

      <div className="overflow-x-auto border border-terminal-border rounded">
        <table className="terminal">
          <thead>
            <tr>
              <th onClick={() => toggleSort('rank')}>#</th>
              <th>Collection</th>
              {COLUMNS.filter((c) => c.key !== 'rank').map((c) => (
                <th key={c.key} onClick={() => toggleSort(c.key)} className="num">
                  {c.label}
                  {sortKey === c.key ? (asc ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.slug}>
                <td className="dim">{r.rank ?? '—'}</td>
                <td>
                  <Link href={`/collections/${r.slug}`} className="text-terminal-accent hover:underline">
                    {r.name}
                  </Link>
                  {!r.passesFilter && <span className="dim"> · filtered</span>}
                </td>
                {COLUMNS.filter((c) => c.key !== 'rank').map((c) => (
                  <td key={c.key} className={`num ${c.cls ? c.cls(r) : ''}`}>
                    {c.fmt(r)}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="dim" style={{ textAlign: 'center', padding: 24 }}>
                  No collections match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterNum({
  label,
  value,
  setValue,
  step,
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
  step: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-terminal-muted">
      {label}
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => setValue(Number(e.target.value) || 0)}
        className="bg-terminal-panel border border-terminal-border rounded px-2 py-1 w-24 text-terminal-text"
      />
    </label>
  );
}
