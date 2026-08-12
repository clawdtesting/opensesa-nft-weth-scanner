'use client';

import { useState } from 'react';

interface InspectResult {
  address: string;
  isContract: boolean;
  verified: boolean;
  verifiedName: string | null;
  classification: string;
  abiFunctions: string[];
  detected: string[];
  extra: Record<string, string>;
  note?: string;
}

export function ContractInspector({ initial, highlight = [] }: { initial: string; highlight?: string[] }) {
  const [text, setText] = useState(initial);
  const [results, setResults] = useState<InspectResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hi = new Set(highlight.map((h) => h.toLowerCase()));

  async function run() {
    setLoading(true);
    setError('');
    try {
      const addresses = text.split(/[\s,]+/).filter(Boolean).join(',');
      const res = await fetch(`/api/inspect?addresses=${encodeURIComponent(addresses)}`);
      const body = (await res.json()) as { results?: InspectResult[]; error?: string };
      if (!res.ok || !body.results) throw new Error(body.error ?? `Inspect failed (HTTP ${res.status}).`);
      setResults(body.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inspect failed');
    } finally {
      setLoading(false);
    }
  }

  function label(addr?: string) {
    if (!addr) return '';
    const a = addr.toLowerCase();
    if (hi.has(a)) return ' (★ this is $YARD)';
    return '';
  }

  return (
    <div className="border border-terminal-border rounded bg-terminal-panel p-4 mb-4 max-w-3xl">
      <h2 className="text-sm font-semibold text-terminal-text mb-1">Contract inspector</h2>
      <p className="text-[11px] text-terminal-muted mb-2">
        Identifies each address (token / pool / router / factory / wallet) from its bytecode and
        Blockscout ABI, so we know which contract to buy through.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        spellCheck={false}
        className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-2 text-xs text-terminal-text font-mono"
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={run}
          disabled={loading}
          className="border border-terminal-accent text-terminal-accent rounded px-4 py-1.5 text-sm hover:bg-terminal-accent/10 disabled:opacity-40"
        >
          {loading ? 'Inspecting…' : 'Inspect'}
        </button>
        <span className="text-[11px] text-terminal-muted">needs RPC_URL configured</span>
      </div>

      {error && <p className="text-sm neg mt-2">{error}</p>}

      {results && (
        <div className="flex flex-col gap-2 mt-3">
          {results.map((r) => (
            <div key={r.address} className="border border-terminal-border rounded p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-terminal-text font-semibold">{r.classification}</span>
                {r.verified && (
                  <span className="text-[9px] uppercase border border-terminal-green text-terminal-green rounded px-1 py-0.5">verified</span>
                )}
                {r.verifiedName && <span className="text-[11px] text-terminal-muted">{r.verifiedName}</span>}
                {hi.has(r.address.toLowerCase()) && <span className="text-[11px] text-terminal-amber">★ $YARD</span>}
              </div>
              <div className="text-[11px] text-terminal-muted font-mono break-all mt-0.5">{r.address}</div>

              {(r.extra.token0 || r.extra.token1) && (
                <div className="text-[11px] mt-1">
                  <span className="text-terminal-muted">pair: </span>
                  <span className="font-mono text-terminal-text break-all">
                    token0={r.extra.token0}{label(r.extra.token0)} · token1={r.extra.token1}{label(r.extra.token1)}
                  </span>
                </div>
              )}
              {r.extra.factory && <div className="text-[11px] mt-0.5"><span className="text-terminal-muted">factory: </span><span className="font-mono">{r.extra.factory}</span></div>}
              {r.extra.WETH && <div className="text-[11px] mt-0.5"><span className="text-terminal-muted">WETH(): </span><span className="font-mono">{r.extra.WETH}</span></div>}

              {(r.abiFunctions.length > 0 || r.detected.length > 0) && (
                <div className="text-[11px] text-terminal-muted mt-1 break-words">
                  <span className="uppercase tracking-wide">fns:</span>{' '}
                  {(r.abiFunctions.length ? r.abiFunctions : r.detected).slice(0, 40).join(', ')}
                </div>
              )}
              {r.note && <p className="text-[11px] text-terminal-amber mt-1">{r.note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
