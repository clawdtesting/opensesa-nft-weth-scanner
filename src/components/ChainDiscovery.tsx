'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChainScanResult, DiscoveredContract } from '@/domain/types';

export function ChainDiscovery() {
  const [blocks, setBlocks] = useState('10000');
  const [data, setData] = useState<ChainScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [auto, setAuto] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const scan = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/scan-chain?blocks=${encodeURIComponent(blocks || '10000')}`);
        const body = (await res.json()) as ChainScanResult & { error?: string };
        if (!res.ok) throw new Error(body?.error ?? `Scan failed (HTTP ${res.status}).`);
        setData(body);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Scan failed');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [blocks],
  );

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(() => scan(true), 15_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [auto, scan]);

  const nfts = (data?.contracts ?? []).filter((c) => c.kind === 'ERC-721' || c.kind === 'ERC-1155');
  const tokens = (data?.contracts ?? []).filter((c) => c.kind === 'ERC-20');

  return (
    <div className="border border-terminal-border rounded bg-terminal-panel p-4 mb-4 max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-sm font-semibold text-terminal-text">Discover · new on Robinhood chain</h2>
        <span className="text-[11px] text-terminal-muted">newly-minting contracts</span>
      </div>
      <p className="text-[11px] text-terminal-muted mb-3">
        Scans recent blocks for mint events, then classifies each contract. Click <em>Use</em> to load
        an NFT into the collection box or a token into the token box below.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <label className="text-[11px] text-terminal-muted">Blocks</label>
        <input
          value={blocks}
          onChange={(e) => setBlocks(e.target.value)}
          type="number"
          min="100"
          className="w-28 bg-terminal-bg border border-terminal-border rounded px-2 py-1.5 text-sm text-terminal-text"
        />
        <button
          onClick={() => scan(false)}
          disabled={loading}
          className="border border-terminal-accent text-terminal-accent rounded px-4 py-1.5 text-sm hover:bg-terminal-accent/10 disabled:opacity-40"
        >
          {loading ? 'Scanning…' : 'Scan'}
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-terminal-muted cursor-pointer">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Auto 15s
        </label>
      </div>

      {error && <p className="text-sm neg mb-2">{error}</p>}
      {data?.note && <p className="text-[11px] text-terminal-amber mb-2">{data.note}</p>}
      {data && (
        <p className="text-[11px] text-terminal-muted mb-3">
          blocks {data.fromBlock.toLocaleString()}–{data.toBlock.toLocaleString()} · {nfts.length} NFT ·{' '}
          {tokens.length} token
        </p>
      )}

      {data && (
        <div className="grid md:grid-cols-2 gap-4">
          <ContractList title="NFT collections" rows={nfts} empty="No new NFT mints in range." />
          <ContractList title="Tokens" rows={tokens} empty="No new token mints in range." />
        </div>
      )}
    </div>
  );
}

function ContractList({ title, rows, empty }: { title: string; rows: DiscoveredContract[]; empty: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-terminal-muted mb-1">{title}</div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-terminal-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((c) => (
            <li key={c.address} className="flex items-center gap-2 border border-terminal-border rounded px-2 py-1.5 text-sm">
              <div className="min-w-0">
                <div className="text-terminal-text truncate">
                  {c.symbol || c.name || 'unknown'}{' '}
                  <span className="text-[10px] text-terminal-muted">{c.kind}</span>
                </div>
                <div className="text-[10px] text-terminal-muted font-mono truncate" title={c.address}>
                  {short(c.address)} · blk {c.lastBlock.toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => loadIntoBox(c)}
                className="ml-auto text-xs border border-terminal-accent/60 text-terminal-accent rounded px-2 py-1 hover:bg-terminal-accent/10"
              >
                Use ↓
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Load a discovered contract into the matching box below via a window event. */
function loadIntoBox(c: DiscoveredContract) {
  const name = c.kind === 'ERC-20' ? 'nftbuy:use-token' : 'nftbuy:use-collection';
  window.dispatchEvent(new CustomEvent(name, { detail: c.address }));
}

function short(a: string): string {
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}
