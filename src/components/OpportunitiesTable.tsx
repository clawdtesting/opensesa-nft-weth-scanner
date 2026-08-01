'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

const WIDTH_KEY = 'opps.collWidth';
const MIN_W = 140;
const MAX_W = 640;

export function OpportunitiesTable({ rows }: { rows: OpportunityRow[] }) {
  // Local, mutable copy so a single-row refresh can update just that row.
  const [data, setData] = useState<OpportunityRow[]>(rows);
  useEffect(() => setData(rows), [rows]);

  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [asc, setAsc] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [minSales, setMinSales] = useState(0);
  const [minAccepted, setMinAccepted] = useState(0);
  const [minRoi, setMinRoi] = useState(0);
  const [floorMin, setFloorMin] = useState(0);
  const [floorMax, setFloorMax] = useState(0); // 0 = no upper limit
  const [onlyPassing, setOnlyPassing] = useState(false);

  const [collWidth, setCollWidth] = useState(220);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string>('');

  // Restore the saved Collection column width.
  useEffect(() => {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= MIN_W) setCollWidth(saved);
  }, []);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = collWidth;
      const onMove = (ev: MouseEvent) => {
        const w = Math.max(MIN_W, Math.min(MAX_W, startW + ev.clientX - startX));
        setCollWidth(w);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        setCollWidth((w) => {
          window.localStorage.setItem(WIDTH_KEY, String(w));
          return w;
        });
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [collWidth],
  );

  const refreshRow = useCallback(async (slug: string) => {
    setRefreshing(slug);
    setRowError('');
    try {
      const res = await fetch(`/api/collections/${slug}/refresh`, { method: 'POST' });
      const raw = await res.text();
      let body: { row?: OpportunityRow; error?: string } | null = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
      if (!res.ok || !body?.row) throw new Error(body?.error ?? `Refresh failed (HTTP ${res.status}).`);
      const updated = body.row;
      setData((prev) => prev.map((r) => (r.slug === slug ? updated : r)));
    } catch (err) {
      setRowError(`${slug}: ${err instanceof Error ? err.message : 'refresh failed'}`);
    } finally {
      setRefreshing(null);
    }
  }, []);

  const filtered = useMemo(() => {
    const out = data.filter(
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
  }, [data, sortKey, asc, minScore, minSales, minAccepted, minRoi, floorMin, floorMax, onlyPassing]);

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
        <FilterNum label="Floor min (Ξ)" value={floorMin} setValue={setFloorMin} step={0.001} />
        <FilterNum label="Floor max (Ξ, 0=∞)" value={floorMax} setValue={setFloorMax} step={0.001} />
        <label className="flex items-center gap-2 text-terminal-muted">
          <input type="checkbox" checked={onlyPassing} onChange={(e) => setOnlyPassing(e.target.checked)} />
          only passing filters
        </label>
        <span className="ml-auto text-terminal-muted">{filtered.length} collections</span>
      </div>

      {rowError && <p className="neg text-xs mb-2">{rowError}</p>}

      <div className="overflow-x-auto border border-terminal-border rounded">
        <table className="terminal">
          <thead>
            <tr>
              <th onClick={() => toggleSort('rank')}>#</th>
              <th style={{ width: collWidth, minWidth: collWidth }}>
                <span>Collection</span>
                {/* drag handle to resize the column */}
                <span
                  onMouseDown={startResize}
                  title="Drag to resize"
                  className="absolute right-0 top-0 h-full w-[6px] cursor-col-resize select-none hover:bg-terminal-accent/50"
                />
              </th>
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
                <td style={{ width: collWidth, maxWidth: collWidth }}>
                  <div className="flex items-center gap-1.5" style={{ maxWidth: collWidth }}>
                    <a
                      href={`https://opensea.io/collection/${r.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      title="View on OpenSea"
                      className="shrink-0 leading-none"
                    >
                      <OpenSeaIcon />
                    </a>
                    <Link
                      href={`/collections/${r.slug}`}
                      className="text-terminal-accent hover:underline truncate min-w-0"
                    >
                      {r.name}
                    </Link>
                    {!r.passesFilter && <span className="dim shrink-0">· filtered</span>}
                    <button
                      onClick={() => refreshRow(r.slug)}
                      disabled={refreshing === r.slug}
                      title="Refresh price & offers"
                      className="ml-auto shrink-0 text-terminal-muted hover:text-terminal-accent disabled:opacity-50"
                    >
                      <span className={refreshing === r.slug ? 'inline-block animate-spin' : ''}>↻</span>
                    </button>
                  </div>
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

function OpenSeaIcon() {
  // Simplified OpenSea mark: a blue disc with a light sail glyph.
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#2081E2" />
      <path
        d="M5 13.2h4.1c.3 0 .5-.2.6-.4.5-1.1 1.6-3.7 1.6-3.7s-.6 2.9-.4 4.1h2.2c.2 0 .4-.1.5-.3l.5-.8H19c0 1.9-2.2 3.9-4.9 3.9H7.4c-1.3 0-2.4-1-2.4-2.8z"
        fill="#fff"
      />
    </svg>
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
