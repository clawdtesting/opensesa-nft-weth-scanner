'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RobinhoodCollection } from '@/domain/types';
import { formatEth } from '@/lib/money';

interface RobinhoodResponse {
  chain: string;
  items: RobinhoodCollection[];
  source: string;
  note?: string;
  error?: string;
  lastRefreshAt?: string | null;
}

type SortKey = 'holders' | 'itemCount' | 'volume24hEth' | 'volume96hEth';

interface Filters {
  minHolders: string;
  minItems: string;
  minVol24h: string;
  minVol96h: string;
}

const EMPTY_FILTERS: Filters = { minHolders: '', minItems: '', minVol24h: '', minVol96h: '' };

export function RobinhoodView() {
  const [data, setData] = useState<RobinhoodResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>('volume24hEth');

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/robinhood${refresh ? '?refresh=1' : ''}`);
      const raw = await res.text();
      let body: RobinhoodResponse | null = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
      if (!res.ok || !body) throw new Error(body?.error ?? `Failed to load (HTTP ${res.status}).`);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Robinhood collections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => data?.items ?? [], [data]);

  const filtered = useMemo(() => {
    const min = (v: string) => {
      const n = Number(v);
      return v.trim() !== '' && Number.isFinite(n) ? n : null;
    };
    const fH = min(filters.minHolders);
    const fI = min(filters.minItems);
    const f24 = min(filters.minVol24h);
    const f96 = min(filters.minVol96h);

    const pass = (val: number | null, threshold: number | null) =>
      threshold === null ? true : val !== null && val >= threshold;

    const rows = items.filter(
      (c) =>
        pass(c.holders, fH) &&
        pass(c.itemCount, fI) &&
        pass(c.volume24hEth, f24) &&
        pass(c.volume96hEth, f96),
    );

    return rows.sort((a, b) => (b[sortKey] ?? -Infinity) - (a[sortKey] ?? -Infinity));
  }, [items, filters, sortKey]);

  const activeFilters = Object.values(filters).some((v) => v.trim() !== '');

  return (
    <div>
      {/* Filter bar */}
      <div className="border border-terminal-border rounded bg-terminal-panel p-3 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <NumberFilter
            label="Min holders"
            value={filters.minHolders}
            onChange={(v) => setFilters((f) => ({ ...f, minHolders: v }))}
          />
          <NumberFilter
            label="Min items"
            value={filters.minItems}
            onChange={(v) => setFilters((f) => ({ ...f, minItems: v }))}
          />
          <NumberFilter
            label="Min 24h vol (Ξ)"
            value={filters.minVol24h}
            onChange={(v) => setFilters((f) => ({ ...f, minVol24h: v }))}
          />
          <NumberFilter
            label="Min 96h vol (Ξ)"
            value={filters.minVol96h}
            onChange={(v) => setFilters((f) => ({ ...f, minVol96h: v }))}
          />
        </div>
        <div className="flex items-center gap-3 mt-3 text-xs">
          <label className="text-terminal-muted">
            Sort by{' '}
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-terminal-text"
            >
              <option value="volume24hEth">24h volume</option>
              <option value="volume96hEth">96h volume</option>
              <option value="holders">Holders</option>
              <option value="itemCount">Items</option>
            </select>
          </label>
          {activeFilters && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="text-terminal-muted hover:text-terminal-text underline"
            >
              Clear filters
            </button>
          )}
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="ml-auto text-terminal-muted hover:text-terminal-text border border-terminal-border rounded px-2 py-1 disabled:opacity-50"
          >
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Status line */}
      <div className="flex items-center gap-3 mb-3 text-[11px] text-terminal-muted">
        <span>
          {filtered.length} of {items.length} collections
        </span>
        <span className="ml-auto">
          {data?.lastRefreshAt ? `updated ${fmtTime(data.lastRefreshAt)}` : 'not yet cached'}
        </span>
      </div>

      {data?.note && (
        <p className="text-xs text-terminal-amber mb-3 border border-terminal-border rounded px-3 py-2 bg-terminal-panel">
          {data.note}
        </p>
      )}

      {loading && !data && <p className="text-sm text-terminal-muted">Loading Robinhood collections…</p>}
      {error && <p className="text-sm neg">{error}</p>}

      {data && filtered.length === 0 && !error && (
        <div className="border border-terminal-border rounded p-8 text-sm text-terminal-muted text-center">
          {items.length === 0
            ? 'No collections returned for the Robinhood chain yet.'
            : 'No collections match the current filters.'}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto border border-terminal-border rounded">
          <table className="terminal">
            <thead>
              <tr>
                <th>Collection</th>
                <th className="num">Holders</th>
                <th className="num">Items</th>
                <th className="num">Floor</th>
                <th className="num">24h Vol</th>
                <th className="num">96h Vol</th>
                <th className="num">Total Vol</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.slug}>
                  <td>
                    <div className="flex items-center gap-2 min-w-0">
                      {c.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.imageUrl} alt="" className="w-6 h-6 rounded object-cover bg-terminal-bg shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded bg-terminal-bg shrink-0" />
                      )}
                      <span className="truncate max-w-[220px]" title={c.name}>
                        {c.name}
                      </span>
                    </div>
                  </td>
                  <td className="num">{fmtInt(c.holders)}</td>
                  <td className="num">{fmtInt(c.itemCount)}</td>
                  <td className="num">{formatEth(c.floorEth)}</td>
                  <td className="num">{formatEth(c.volume24hEth, 3)}</td>
                  <td className="num">{formatEth(c.volume96hEth, 3)}</td>
                  <td className="num">{formatEth(c.totalVolumeEth, 2)}</td>
                  <td className="num">
                    {c.openseaUrl && (
                      <a
                        href={c.openseaUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="View on OpenSea"
                        className="inline-flex leading-none align-middle"
                      >
                        <OpenSeaIcon />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NumberFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-terminal-muted">{label}</span>
      <input
        type="number"
        min="0"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="any"
        className="bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-sm text-terminal-text w-full"
      />
    </label>
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

function fmtInt(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? '—' : Math.round(n).toLocaleString();
}

function fmtTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}
