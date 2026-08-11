'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface TokenInfo {
  address: string;
  symbol: string | null;
  decimals: number | null;
  balance: number | null;
  fetchedAt: string;
  note?: string;
}

interface Sample {
  t: number; // ms epoch
  price: number; // ETH per token
}

interface Activity {
  address: string;
  rpcOk: boolean;
  hasCode: boolean;
  deploymentBlock: number | null;
  deployedAt: string | null;
  tradingStarted: boolean;
  firstTransferBlock: number | null;
  firstTransferAt: string | null;
  lastTransferBlock: number | null;
  lastTransferAt: string | null;
  transferCount: number;
  capped: boolean;
  toBlock: number;
  scannedFrom: number;
  fetchedAt: string;
  note?: string;
}
const ACTIVITY_MS = 5_000; // poll trading activity every 5s

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const TIMEFRAMES = [
  { key: '15s', ms: 15_000 },
  { key: '30s', ms: 30_000 },
  { key: '1m', ms: 60_000 },
  { key: '2m', ms: 120_000 },
  { key: '3m', ms: 180_000 },
  { key: '5m', ms: 300_000 },
];
const BUFFER_MS = 300_000; // keep 5 minutes of samples
const SAMPLE_MS = 3_000; // poll price every 3s

export function TokenPanel({ initialAddress }: { initialAddress?: string } = {}) {
  const [address, setAddress] = useState(initialAddress ?? '');
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [armed, setArmed] = useState(false);
  const [tf, setTf] = useState(60_000); // default 1m window
  const [samples, setSamples] = useState<Sample[]>([]);
  const [priceNote, setPriceNote] = useState('');
  const [buyAmt, setBuyAmt] = useState('');
  const [sellAmt, setSellAmt] = useState('');
  const [activity, setActivity] = useState<Activity | null>(null);
  const [delta, setDelta] = useState(0);
  const prevCount = useRef<number | null>(null);

  const valid = ADDRESS_RE.test(address.trim());

  const fetchInfo = useCallback(async (addressOverride?: string) => {
    const addr = (addressOverride ?? address).trim();
    if (!ADDRESS_RE.test(addr)) {
      setError('Enter a valid token contract address (0x + 40 hex chars).');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/token?address=${encodeURIComponent(addr)}`);
      const body = (await res.json()) as TokenInfo & { error?: string };
      if (!res.ok) throw new Error(body?.error ?? `Fetch failed (HTTP ${res.status}).`);
      setInfo(body);
      setArmed(true); // start sampling price + activity
      setSamples([]);
      setActivity(null);
      setDelta(0);
      prevCount.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [address]);

  // "Use" from the discovery panel loads a token here and fetches it.
  useEffect(() => {
    const handler = (e: Event) => {
      const addr = (e as CustomEvent<string>).detail;
      if (!addr) return;
      setAddress(addr);
      void fetchInfo(addr);
    };
    window.addEventListener('nftbuy:use-token', handler);
    return () => window.removeEventListener('nftbuy:use-token', handler);
  }, [fetchInfo]);

  // Auto-load a preset token (e.g. a dedicated $YARD tab) once on mount.
  const didAutoLoad = useRef(false);
  useEffect(() => {
    if (didAutoLoad.current) return;
    if (initialAddress && ADDRESS_RE.test(initialAddress.trim())) {
      didAutoLoad.current = true;
      void fetchInfo(initialAddress);
    }
  }, [initialAddress, fetchInfo]);

  // Live trading-activity polling while armed.
  useEffect(() => {
    if (!armed || !valid) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/token/activity?address=${encodeURIComponent(address.trim())}`);
        const body = (await res.json()) as Activity;
        if (cancelled || !res.ok) return;
        setActivity(body);
        if (prevCount.current !== null) setDelta(body.transferCount - prevCount.current);
        prevCount.current = body.transferCount;
      } catch {
        /* transient */
      }
    };
    void tick();
    const id = setInterval(tick, ACTIVITY_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [armed, valid, address]);

  // Live price sampling while armed.
  const armedRef = useRef(armed);
  armedRef.current = armed;
  useEffect(() => {
    if (!armed || !valid) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/token/price?address=${encodeURIComponent(address.trim())}`);
        const body = (await res.json()) as { priceEth: number | null; at: string; note?: string };
        if (cancelled) return;
        if (typeof body.priceEth === 'number') {
          setPriceNote('');
          setSamples((prev) => {
            const next = [...prev, { t: Date.parse(body.at) || Date.now(), price: body.priceEth as number }];
            const cutoff = Date.now() - BUFFER_MS;
            return next.filter((s) => s.t >= cutoff);
          });
        } else {
          setPriceNote(body.note ?? 'No price available yet.');
        }
      } catch {
        /* transient */
      }
    };
    void tick();
    const id = setInterval(tick, SAMPLE_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [armed, valid, address]);

  const windowed = useMemo(() => {
    const cutoff = Date.now() - tf;
    return samples.filter((s) => s.t >= cutoff);
  }, [samples, tf]);

  const last = windowed[windowed.length - 1]?.price ?? null;
  const first = windowed[0]?.price ?? null;
  const changePct = first && last ? (last - first) / first : null;

  return (
    <div className="border border-terminal-border rounded bg-terminal-panel p-4 mt-6 max-w-3xl">
      <h2 className="text-sm font-semibold text-terminal-text mb-1">Token trade</h2>
      <p className="text-[11px] text-terminal-muted mb-3">
        Paste a token contract (e.g. $MANCER once live) and Fetch to read it on Robinhood chain and
        chart its price live.
      </p>

      {/* Address + fetch */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Token contract 0x…"
          spellCheck={false}
          className="flex-1 bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-sm text-terminal-text font-mono"
        />
        <button
          onClick={() => fetchInfo()}
          disabled={loading || !valid}
          className="border border-terminal-accent text-terminal-accent rounded px-4 py-2 text-sm hover:bg-terminal-accent/10 disabled:opacity-40"
        >
          {loading ? 'Fetching…' : 'Fetch'}
        </button>
      </div>
      {address.trim() !== '' && !valid && <p className="text-[11px] neg mt-1">Not a valid 0x address</p>}
      {error && <p className="text-sm neg mt-2">{error}</p>}

      {info && (
        <>
          {/* Token header */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-terminal-border text-sm">
            <span className="text-terminal-text font-semibold">{info.symbol ?? 'UNKNOWN'}</span>
            <span className="text-[11px] text-terminal-muted">
              balance <span className="font-mono text-terminal-text">{info.balance !== null ? info.balance.toFixed(4) : '—'}</span>
            </span>
            <span className="ml-auto text-lg font-mono">
              {last !== null ? `Ξ ${last.toPrecision(6)}` : '—'}
            </span>
            {changePct !== null && (
              <span className={`text-xs ${changePct >= 0 ? 'pos' : 'neg'}`}>
                {(changePct * 100).toFixed(2)}%
              </span>
            )}
          </div>
          {info.note && <p className="text-[11px] text-terminal-amber mt-1">{info.note}</p>}

          {/* Trading activity — is it live + transaction count */}
          <div className="mt-3 border border-terminal-border rounded p-3">
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-semibold ${
                  activity && !activity.rpcOk
                    ? 'neg'
                    : activity?.tradingStarted
                      ? 'pos'
                      : activity?.hasCode
                        ? 'text-terminal-amber'
                        : 'text-terminal-muted'
                }`}
              >
                {!activity
                  ? 'Checking…'
                  : !activity.rpcOk
                    ? '⚠️ RPC unreachable — set RPC_URL'
                    : activity.tradingStarted
                      ? '🟢 TRADING LIVE'
                      : activity.hasCode
                        ? '🟡 Deployed · not trading yet'
                        : '⚪ Not deployed yet'}
              </span>
              {delta > 0 && <span className="text-[11px] pos">+{delta} new</span>}
              <span className="ml-auto text-[11px] text-terminal-muted">
                every {ACTIVITY_MS / 1000}s{activity ? ` · ${fmtClock(activity.fetchedAt)}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-xs">
              <Stat label="Transfers" value={activity ? `${activity.transferCount}${activity.capped ? '+' : ''}` : '—'} />
              <Stat label="Started trading" value={activity?.firstTransferAt ? fmtStamp(activity.firstTransferAt) : '—'} />
              <Stat label="Last tx" value={activity?.lastTransferAt ? fmtClock(activity.lastTransferAt) : '—'} />
              <Stat
                label="Deployed"
                value={
                  activity?.deployedAt
                    ? fmtStamp(activity.deployedAt)
                    : activity?.deploymentBlock != null
                      ? `blk ${activity.deploymentBlock.toLocaleString()}`
                      : '—'
                }
              />
            </div>
            {activity?.note && <p className="text-[11px] text-terminal-amber mt-1">{activity.note}</p>}
          </div>

          {/* Timeframe selector */}
          <div className="flex items-center gap-1.5 mt-3">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.key}
                onClick={() => setTf(t.ms)}
                className={`text-[11px] px-2 py-1 rounded border ${
                  tf === t.ms
                    ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
                    : 'border-terminal-border text-terminal-muted hover:text-terminal-text'
                }`}
              >
                {t.key}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-terminal-muted">live · {SAMPLE_MS / 1000}s samples</span>
          </div>

          {/* Chart */}
          <PriceChart points={windowed} windowMs={tf} />
          {windowed.length < 2 && (
            <p className="text-[11px] text-terminal-muted mt-1">
              {priceNote || 'Collecting price samples…'}
            </p>
          )}

          {/* Buy / sell */}
          <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-terminal-border">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-terminal-muted mb-1">Buy — amount (ETH)</label>
              <div className="flex gap-2">
                <input
                  value={buyAmt}
                  onChange={(e) => setBuyAmt(e.target.value)}
                  type="number"
                  min="0"
                  placeholder="0.0"
                  className="flex-1 bg-terminal-bg border border-terminal-border rounded px-2 py-1.5 text-sm text-terminal-text"
                />
                <button
                  disabled
                  title="Swap execution ships in the next iteration"
                  className="border border-terminal-green/40 text-terminal-green/60 rounded px-3 py-1.5 text-sm cursor-not-allowed"
                >
                  Buy
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-terminal-muted mb-1">
                Sell — amount ({info.symbol ?? 'token'})
              </label>
              <div className="flex gap-2">
                <input
                  value={sellAmt}
                  onChange={(e) => setSellAmt(e.target.value)}
                  type="number"
                  min="0"
                  placeholder="0.0"
                  className="flex-1 bg-terminal-bg border border-terminal-border rounded px-2 py-1.5 text-sm text-terminal-text"
                />
                <button
                  disabled
                  title="Swap execution ships in the next iteration"
                  className="border border-terminal-red/40 text-terminal-red/60 rounded px-3 py-1.5 text-sm cursor-not-allowed"
                >
                  Sell
                </button>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-terminal-muted mt-2">
            Buy/Sell execution (DEX swap on Robinhood chain) is the next iteration — the buttons are
            disabled until it&apos;s wired.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-terminal-muted">{label}</span>
      <span className="font-mono text-terminal-text">{value}</span>
    </div>
  );
}

/** Local HH:MM:SS. */
function fmtClock(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleTimeString([], { hour12: false });
}

/** Local short date + time, e.g. "Aug 6, 18:00:05". */
function fmtStamp(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/** Minimal inline-SVG line chart of price over the selected window. */
function PriceChart({ points, windowMs }: { points: Sample[]; windowMs: number }) {
  const W = 640;
  const H = 160;
  const pad = 6;

  const path = useMemo(() => {
    if (points.length < 2) return '';
    const now = Date.now();
    const t0 = now - windowMs;
    const prices = points.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || max || 1;
    const x = (t: number) => pad + ((t - t0) / windowMs) * (W - 2 * pad);
    const y = (p: number) => H - pad - ((p - min) / span) * (H - 2 * pad);
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.price).toFixed(1)}`).join(' ');
  }, [points, windowMs]);

  const firstP = points[0]?.price;
  const lastP = points[points.length - 1]?.price;
  const rising = firstP !== undefined && lastP !== undefined && lastP >= firstP;

  return (
    <div className="mt-2 border border-terminal-border rounded bg-terminal-bg overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
        {path ? (
          <path d={path} fill="none" stroke={rising ? '#22c55e' : '#ef4444'} strokeWidth="1.5" />
        ) : (
          <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="#3a3a3a" strokeDasharray="4 4" />
        )}
      </svg>
    </div>
  );
}
