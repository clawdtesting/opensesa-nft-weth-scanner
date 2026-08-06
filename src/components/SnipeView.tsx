'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SnipeTarget } from '@/domain/types';
import { formatPct } from '@/lib/money';

// OpenSea chain identifiers the sniper can target (Robinhood first / default).
const CHAINS = [
  'robinhood',
  'ethereum',
  'base',
  'arbitrum',
  'optimism',
  'polygon',
  'blast',
  'zora',
  'sei',
];

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function SnipeView() {
  const [contract, setContract] = useState('');
  const [chain, setChain] = useState('robinhood');
  const [target, setTarget] = useState<SnipeTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [auto, setAuto] = useState(false);
  const [maxPrice, setMaxPrice] = useState('');
  // Which listing is currently being bought: an order hash, '__floor__' for the
  // main button, or null when idle.
  const [buyingHash, setBuyingHash] = useState<string | null>(null);
  const [buyResult, setBuyResult] = useState<BuyResult | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const valid = ADDRESS_RE.test(contract.trim());

  const buyFloor = useCallback(
    async (orderHash?: string) => {
      const cap = Number(maxPrice);
      if (!Number.isFinite(cap) || cap <= 0) {
        setBuyResult({ ok: false, error: 'Set a max price (ETH) before buying.' });
        return;
      }
      setBuyingHash(orderHash ?? '__floor__');
      setBuyResult(null);
      try {
        const res = await fetch('/api/snipe/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contract: contract.trim(), chain, maxPriceEth: cap, orderHash }),
        });
        const body = (await res.json()) as BuyResult;
        setBuyResult(body);
      } catch (err) {
        setBuyResult({ ok: false, error: err instanceof Error ? err.message : 'Buy request failed' });
      } finally {
        setBuyingHash(null);
      }
    },
    [maxPrice, contract, chain],
  );

  const fetchTarget = useCallback(
    async (silent = false) => {
      if (!ADDRESS_RE.test(contract.trim())) {
        setError('Enter a valid contract address (0x + 40 hex chars).');
        return;
      }
      if (!silent) setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `/api/snipe?contract=${encodeURIComponent(contract.trim())}&chain=${encodeURIComponent(chain)}`,
        );
        const body = (await res.json()) as SnipeTarget & { error?: string };
        if (!res.ok) throw new Error(body?.error ?? `Fetch failed (HTTP ${res.status}).`);
        setTarget(body);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fetch failed');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [contract, chain],
  );

  // Auto-refetch every 10s while armed (useful right at drop time).
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (auto && valid) {
      timer.current = setInterval(() => fetchTarget(true), 10_000);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [auto, valid, fetchTarget]);

  return (
    <div className="max-w-3xl">
      {/* Input */}
      <div className="border border-terminal-border rounded bg-terminal-panel p-4 mb-4">
        <label className="block text-[10px] uppercase tracking-wide text-terminal-muted mb-1">
          Collection contract address
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            className="flex-1 bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-sm text-terminal-text font-mono"
          />
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            className="bg-terminal-bg border border-terminal-border rounded px-2 py-2 text-sm text-terminal-text"
          >
            {CHAINS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={() => fetchTarget(false)}
            disabled={loading || !valid}
            className="border border-terminal-accent text-terminal-accent rounded px-4 py-2 text-sm hover:bg-terminal-accent/10 disabled:opacity-40"
          >
            {loading ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
        <div className="flex items-center gap-3 mt-2 text-[11px] text-terminal-muted">
          {contract.trim() !== '' && !valid && <span className="neg">Not a valid 0x address</span>}
          <label className="ml-auto flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Auto-refetch every 10s
          </label>
        </div>
      </div>

      {error && <p className="text-sm neg mb-3">{error}</p>}

      {/* Result */}
      {target && (
        <div className="border border-terminal-border rounded bg-terminal-panel overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-terminal-border">
            {target.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={target.imageUrl} alt="" className="w-12 h-12 rounded object-cover bg-terminal-bg" />
            ) : (
              <div className="w-12 h-12 rounded bg-terminal-bg" />
            )}
            <div className="min-w-0">
              <div className="text-sm text-terminal-text truncate">{target.name ?? target.slug ?? 'Unknown collection'}</div>
              <div className="text-[11px] text-terminal-muted truncate font-mono">{target.contract}</div>
            </div>
            <span className="ml-auto text-[10px] uppercase tracking-wide border border-terminal-border rounded px-1.5 py-0.5 text-terminal-muted">
              {target.chain}
            </span>
          </div>

          <SpreadStrip floor={target.floorEth} offer={target.bestOfferEth} />

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 p-4 text-sm border-b border-terminal-border">
            <Row label="Collection" value={target.slug ?? '—'} />
            <Row
              label="Executor"
              value={target.executorReady ? 'ready (PRIVATE_KEY + RPC set)' : 'not configured'}
              valueClass={target.executorReady ? 'pos' : 'neg'}
            />
            <Row label="Fetched" value={fmtTime(target.fetchedAt)} />
          </dl>

          {target.note && (
            <p className="px-4 py-2 text-[11px] text-terminal-amber border-b border-terminal-border">{target.note}</p>
          )}

          {/* 10 cheapest listings — buy any one directly. */}
          {target.floorListings.length > 0 && (
            <div className="border-b border-terminal-border">
              <div className="flex items-center px-4 pt-3 pb-1 text-[10px] uppercase tracking-wide text-terminal-muted">
                <span className="w-8">#</span>
                <span className="w-32">Price</span>
                <span>Token</span>
              </div>
              <ul className="px-2 pb-2">
                {target.floorListings.map((l, i) => (
                  <li key={l.orderHash} className="flex items-center px-2 py-1 text-sm rounded hover:bg-terminal-bg/50">
                    <span className="w-8 text-terminal-muted">{i + 1}</span>
                    <span className="w-32 font-mono text-terminal-text">Ξ {fmtPrice(l.priceEth)}</span>
                    <span className="text-[11px] text-terminal-muted">#{l.tokenId ?? '—'}</span>
                    <button
                      onClick={() => buyFloor(l.orderHash)}
                      disabled={!target.executorReady || buyingHash !== null}
                      title={target.executorReady ? 'Buy this listing' : 'Set PRIVATE_KEY + RPC_URL to enable buying'}
                      className="ml-auto text-xs border border-terminal-green/60 text-terminal-green rounded px-2.5 py-1 hover:bg-terminal-green/10 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {buyingHash === l.orderHash ? 'Buying…' : 'Buy'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-terminal-muted">Max</span>
                <input
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="ETH cap"
                  className="w-28 bg-terminal-bg border border-terminal-border rounded px-2 py-2 text-sm text-terminal-text"
                />
              </div>
              <button
                onClick={() => buyFloor()}
                disabled={!target.executorReady || !target.bestListing || buyingHash !== null}
                title={
                  !target.executorReady
                    ? 'Set PRIVATE_KEY + RPC_URL to enable buying'
                    : !target.bestListing
                      ? 'No floor listing to buy yet'
                      : 'Buy the cheapest now'
                }
                className="border border-terminal-green text-terminal-green rounded px-4 py-2 text-sm hover:bg-terminal-green/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {buyingHash === '__floor__' ? 'Buying…' : '⚡ Buy cheapest now'}
              </button>
              {target.openseaUrl && (
                <a
                  href={target.openseaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-xs text-terminal-muted hover:text-terminal-text underline"
                >
                  View on OpenSea ↗
                </a>
              )}
            </div>

            {!target.executorReady && (
              <p className="text-[11px] text-terminal-amber mt-2">
                Buying is disabled until PRIVATE_KEY + RPC_URL are configured.
              </p>
            )}

            {buyResult && (
              <div
                className={`mt-3 text-xs border rounded px-3 py-2 ${
                  buyResult.ok ? 'border-terminal-green text-terminal-green' : 'border-terminal-red neg'
                }`}
              >
                {buyResult.ok ? (
                  <span>
                    ✓ Submitted{buyResult.spentEth ? ` · ${buyResult.spentEth.toFixed(5)} ETH` : ''} ·{' '}
                    {buyResult.explorerUrl ? (
                      <a href={buyResult.explorerUrl} target="_blank" rel="noreferrer" className="underline">
                        {buyResult.txHash?.slice(0, 10)}… ↗
                      </a>
                    ) : (
                      buyResult.txHash
                    )}
                  </span>
                ) : (
                  <span>✗ {buyResult.error}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface BuyResult {
  ok: boolean;
  txHash?: string;
  explorerUrl?: string;
  spentEth?: number;
  slug?: string;
  error?: string;
}

/** Floor (ask) vs best offer (bid) vs live spread between them. */
function SpreadStrip({ floor, offer }: { floor: number | null; offer: number | null }) {
  const spread = floor !== null && offer !== null ? floor - offer : null; // ask − bid
  const pct = spread !== null && floor ? spread / floor : null;
  // Best offer at/above floor => buy the floor and sell straight into the offer.
  const flip = floor !== null && offer !== null && offer >= floor;

  return (
    <div className="grid grid-cols-3 divide-x divide-terminal-border border-b border-terminal-border">
      <Metric label="Floor · ask" value={floor !== null ? `Ξ ${fmtPrice(floor)}` : '—'} />
      <Metric label="Best offer · bid" value={offer !== null ? `Ξ ${fmtPrice(offer)}` : '—'} />
      <Metric
        label="Spread"
        value={spread !== null ? `${spread < 0 ? '−' : ''}Ξ ${fmtPrice(Math.abs(spread))}` : '—'}
        sub={pct !== null ? `${formatPct(Math.abs(pct))}${flip ? ' · ⚡ flip' : ''}` : undefined}
        valueClass={flip ? 'pos' : ''}
      />
    </div>
  );
}

function Metric({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-terminal-muted">{label}</div>
      <div className={`text-lg font-mono mt-0.5 ${valueClass ?? ''}`}>{value}</div>
      {sub && <div className={`text-[11px] mt-0.5 ${valueClass ?? 'text-terminal-muted'}`}>{sub}</div>}
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-3 min-w-0">
      <dt className="text-terminal-muted shrink-0">{label}</dt>
      <dd className={`text-terminal-text truncate font-mono ${valueClass ?? ''}`} title={value}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Adaptive ETH price formatter: keeps enough significant digits for the tiny
 * sub-0.001 prices common on Robinhood chain (e.g. 0.00008399), so the on-screen
 * value matches the real one instead of rounding to 4 decimals.
 */
function fmtPrice(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  if (v >= 1) return String(parseFloat(v.toFixed(4)));
  // 4 significant figures, trailing zeros stripped.
  return String(parseFloat(v.toPrecision(4)));
}

function fmtTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  // Local browser time (Montreal / Eastern for this user), with the tz label.
  return new Date(t).toLocaleTimeString([], { hour12: false, timeZoneName: 'short' });
}
