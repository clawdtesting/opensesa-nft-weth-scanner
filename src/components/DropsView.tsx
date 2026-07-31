'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { DropItem, DropCategory } from '@/domain/types';
import { formatEth, formatPct } from '@/lib/money';

interface DropsResponse {
  category: DropCategory;
  items: DropItem[];
  source: string;
  note?: string;
  error?: string;
}

const TABS: Array<{ key: DropCategory; label: string }> = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'featured', label: 'Featured' },
  { key: 'recently_minted', label: 'Recently Minted' },
];

export function DropsView() {
  const [tab, setTab] = useState<DropCategory>('upcoming');
  const [data, setData] = useState<Record<string, DropsResponse | undefined>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Single ticking clock drives all countdowns without per-card timers.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(
    async (category: DropCategory) => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/drops?type=${category}`);
        const raw = await res.text();
        let body: DropsResponse | null = null;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch {
          body = null;
        }
        if (!res.ok || !body) throw new Error(body?.error ?? `Failed to load drops (HTTP ${res.status}).`);
        setData((d) => ({ ...d, [category]: body! }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load drops');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!data[tab]) void load(tab);
  }, [tab, data, load]);

  const current = data[tab];
  const items = current?.items ?? [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs uppercase tracking-wide px-3 py-1.5 rounded border ${
              tab === t.key
                ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
                : 'border-terminal-border text-terminal-muted hover:text-terminal-text'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => load(tab)}
          className="ml-auto text-xs text-terminal-muted hover:text-terminal-text border border-terminal-border rounded px-2 py-1.5"
        >
          ↻ Refresh
        </button>
      </div>

      {current?.note && (
        <p className="text-xs text-terminal-amber mb-3 border border-terminal-border rounded px-3 py-2 bg-terminal-panel">
          {current.note}
        </p>
      )}

      {loading && !current && <p className="text-sm text-terminal-muted">Loading {tab}…</p>}
      {error && <p className="text-sm neg">{error}</p>}

      {current && items.length === 0 && !error && (
        <div className="border border-terminal-border rounded p-8 text-sm text-terminal-muted">
          No Ethereum drops to show for “{TABS.find((t) => t.key === tab)?.label}”.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <DropCard key={item.slug} item={item} now={now} />
        ))}
      </div>
    </div>
  );
}

function DropCard({ item, now }: { item: DropItem; now: number }) {
  const live = useMemo(() => isLiveNow(item, now), [item, now]);
  const countdown = useMemo(() => timeUntil(item.mintStart, now), [item.mintStart, now]);
  const started = item.mintStart ? Date.parse(item.mintStart) <= now : false;

  return (
    <div className="border border-terminal-border rounded bg-terminal-panel overflow-hidden flex flex-col">
      <div className="flex items-center gap-3 p-3 border-b border-terminal-border">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded object-cover bg-terminal-bg" />
        ) : (
          <div className="w-10 h-10 rounded bg-terminal-bg" />
        )}
        <div className="min-w-0">
          <div className="text-sm text-terminal-text truncate">{item.name}</div>
          <div className="text-[11px] text-terminal-muted truncate">{item.slug}</div>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <span className="text-[10px] uppercase tracking-wide border border-terminal-border rounded px-1.5 py-0.5 text-terminal-muted">
            Ξ ETH
          </span>
          {item.featured && (
            <span className="text-[10px] uppercase tracking-wide border border-terminal-amber text-terminal-amber rounded px-1.5 py-0.5">
              Featured
            </span>
          )}
        </div>
      </div>

      {/* Status / countdown */}
      <div className="px-3 py-3 border-b border-terminal-border">
        {live ? (
          <div className="text-terminal-green text-sm font-semibold">● MINTING NOW</div>
        ) : countdown && !started ? (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-terminal-muted mb-1">Minting in</div>
            <div className="flex gap-3 text-terminal-text font-mono">
              <TimePart value={countdown.days} label="days" />
              <TimePart value={countdown.hours} label="hours" />
              <TimePart value={countdown.mins} label="mins" />
              <TimePart value={countdown.secs} label="secs" />
            </div>
          </div>
        ) : (
          <div className="text-sm text-terminal-muted">{item.mintStage ?? 'Status —'}</div>
        )}
      </div>

      {/* Mint details */}
      <dl className="px-3 py-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs border-b border-terminal-border">
        <Field label="Mint price" value={item.mintPriceEth !== null ? `${formatEth(item.mintPriceEth)} ${item.mintCurrency ?? 'ETH'}` : '—'} />
        <Field label="Supply" value={item.totalSupply !== null ? item.totalSupply.toLocaleString() : '—'} />
        <Field label="Per wallet" value={item.maxPerWallet !== null ? String(item.maxPerWallet) : '—'} />
        <Field label="Stage" value={item.mintStage ?? '—'} />
        <Field label="Start" value={fmtTime(item.mintStart)} />
        <Field label="End" value={fmtTime(item.mintEnd)} />
        <Field label="Contract" value={item.contract ? short(item.contract) : '—'} />
      </dl>

      {/* Scanner enrichment */}
      {item.scanner?.hasData ? (
        <div className="px-3 py-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs border-b border-terminal-border">
          <Field label="Floor" value={formatEth(item.scanner.floor)} />
          <Field label="Best offer" value={item.scanner.bestBid !== null ? `${formatEth(item.scanner.bestBid)} WETH` : '—'} />
          <Field label="24h volume" value={item.scanner.volume24h !== null ? `${formatEth(item.scanner.volume24h)} ETH` : '—'} />
          <Field
            label="Offer→Floor"
            value={formatPct(item.scanner.offerToFloorSpread)}
            valueClass={(item.scanner.offerToFloorSpread ?? 0) > 0 ? 'pos' : ''}
          />
        </div>
      ) : (
        <div className="px-3 py-2 text-[11px] text-terminal-muted border-b border-terminal-border">
          Not yet tracked by the scanner.
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 p-3">
        {item.scanner?.hasData ? (
          <Link
            href={`/collections/${item.slug}`}
            className="text-xs border border-terminal-accent text-terminal-accent rounded px-2.5 py-1 hover:bg-terminal-accent/10"
          >
            Analyze collection
          </Link>
        ) : (
          <span className="text-xs text-terminal-muted">Analyze — (scan first)</span>
        )}
        {item.openseaUrl && (
          <a
            href={item.openseaUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-xs text-terminal-muted hover:text-terminal-text underline"
          >
            OpenSea ↗
          </a>
        )}
      </div>
    </div>
  );
}

function TimePart({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-lg leading-none">{String(value).padStart(2, '0')}</div>
      <div className="text-[9px] uppercase tracking-wide text-terminal-muted">{label}</div>
    </div>
  );
}

function Field({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-terminal-muted">{label}</dt>
      <dd className={`text-terminal-text ${valueClass ?? ''}`}>{value}</dd>
    </div>
  );
}

// ---- helpers ----
function isLiveNow(item: DropItem, now: number): boolean {
  const start = item.mintStart ? Date.parse(item.mintStart) : NaN;
  const end = item.mintEnd ? Date.parse(item.mintEnd) : NaN;
  if (!Number.isNaN(start) && now < start) return false;
  if (!Number.isNaN(end) && now > end) return false;
  return !Number.isNaN(start) || item.isLive;
}

function timeUntil(iso: string | null, now: number): { days: number; hours: number; mins: number; secs: number } | null {
  if (!iso) return null;
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return null;
  let diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86_400_000);
  diff -= days * 86_400_000;
  const hours = Math.floor(diff / 3_600_000);
  diff -= hours * 3_600_000;
  const mins = Math.floor(diff / 60_000);
  diff -= mins * 60_000;
  const secs = Math.floor(diff / 1000);
  return { days, hours, mins, secs };
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
