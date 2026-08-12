'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface MintCandidate {
  signature: string;
  source: 'abi' | 'bytecode';
}
interface MintDetect {
  address: string;
  isContract: boolean;
  verified: boolean;
  verifiedName: string | null;
  candidates: MintCandidate[];
  priceWei: string | null;
  priceEth: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  executorReady: boolean;
  note?: string;
}
interface MintResult {
  ok: boolean;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function MintPanel({ initialAddress = '' }: { initialAddress?: string }) {
  const [contract, setContract] = useState(initialAddress);
  const [detect, setDetect] = useState<MintDetect | null>(null);
  const [sig, setSig] = useState('');
  const [qty, setQty] = useState('1');
  const [value, setValue] = useState('');
  const [poll, setPoll] = useState(false);
  const [minting, setMinting] = useState(false);
  const [result, setResult] = useState<MintResult | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const valid = ADDRESS_RE.test(contract.trim());

  const runDetect = useCallback(async (silent = false) => {
    if (!ADDRESS_RE.test(contract.trim())) return;
    if (!silent) setError('');
    try {
      const res = await fetch(`/api/mint/detect?address=${encodeURIComponent(contract.trim())}`);
      const body = (await res.json()) as MintDetect & { error?: string };
      if (!res.ok) throw new Error(body?.error ?? 'Detect failed');
      setDetect(body);
      // Auto-pick the first candidate + price on the first successful detect.
      setSig((prev) => prev || body.candidates[0]?.signature || '');
      if (body.priceEth != null) {
        setValue((prev) => prev || String(round(body.priceEth! * (Number(qty) || 1))));
      }
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Detect failed');
    }
  }, [contract, qty]);

  // Auto-detect on mount if prefilled, and poll while armed (waiting for deploy).
  useEffect(() => {
    if (valid) void runDetect(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (poll && valid) timer.current = setInterval(() => runDetect(true), 4000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [poll, valid, runDetect]);

  // Keep value synced to price × qty when a price is known and user hasn't overridden.
  const priceEth = detect?.priceEth ?? null;
  useEffect(() => {
    if (priceEth != null) setValue(String(round(priceEth * (Number(qty) || 1))));
  }, [priceEth, qty]);

  async function mint() {
    if (!sig) {
      setError('No mint function selected.');
      return;
    }
    setMinting(true);
    setResult(null);
    setError('');
    try {
      const res = await fetch('/api/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract: contract.trim(), signature: sig, quantity: Number(qty) || 1, valueEth: value || '0' }),
      });
      setResult((await res.json()) as MintResult);
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : 'Mint request failed' });
    } finally {
      setMinting(false);
    }
  }

  return (
    <div className="border border-terminal-accent/50 rounded bg-terminal-panel p-4 mb-4 max-w-3xl">
      <h2 className="text-sm font-semibold text-terminal-text mb-1">⚡ Mint NFT</h2>
      <p className="text-[11px] text-terminal-muted mb-3">
        Calls the collection&apos;s own mint function directly. Detect finds the function + price;
        Mint simulates then sends (a wrong value can&apos;t burn funds — it just reverts).
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={contract}
          onChange={(e) => setContract(e.target.value)}
          placeholder="NFT contract 0x…"
          spellCheck={false}
          className="flex-1 bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-sm text-terminal-text font-mono"
        />
        <button
          onClick={() => runDetect(false)}
          disabled={!valid}
          className="border border-terminal-accent text-terminal-accent rounded px-4 py-2 text-sm hover:bg-terminal-accent/10 disabled:opacity-40"
        >
          Detect
        </button>
        <label className="flex items-center gap-1.5 text-[11px] text-terminal-muted cursor-pointer">
          <input type="checkbox" checked={poll} onChange={(e) => setPoll(e.target.checked)} />
          Poll 4s
        </label>
      </div>

      {detect && (
        <div className="text-[11px] text-terminal-muted mt-2">
          {detect.isContract ? (
            <>
              {detect.verified && <span className="text-terminal-green">verified </span>}
              {detect.verifiedName ?? 'contract'} · price{' '}
              <span className="text-terminal-text font-mono">{detect.priceEth != null ? `${detect.priceEth} ETH` : 'unknown'}</span>
              {' · '}supply <span className="text-terminal-text font-mono">{detect.totalSupply ?? '—'}{detect.maxSupply != null ? `/${detect.maxSupply}` : ''}</span>
              {' · executor '}<span className={detect.executorReady ? 'pos' : 'neg'}>{detect.executorReady ? 'ready' : 'not set'}</span>
            </>
          ) : (
            <span className="text-terminal-amber">{detect.note ?? 'not a contract yet'}</span>
          )}
        </div>
      )}
      {detect?.note && detect.isContract && <p className="text-[11px] text-terminal-amber mt-1">{detect.note}</p>}

      {/* Mint controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-terminal-muted">Mint function</span>
          <select
            value={sig}
            onChange={(e) => setSig(e.target.value)}
            className="bg-terminal-bg border border-terminal-border rounded px-2 py-2 text-sm text-terminal-text"
          >
            <option value="">— select —</option>
            {(detect?.candidates ?? []).map((c) => (
              <option key={c.signature} value={c.signature}>
                {c.signature} {c.source === 'bytecode' ? '(guessed)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-terminal-muted">Quantity</span>
          <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="1" className="bg-terminal-bg border border-terminal-border rounded px-2 py-2 text-sm text-terminal-text" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-terminal-muted">Total value (ETH)</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} type="number" min="0" step="0.0001" placeholder="0.0" className="bg-terminal-bg border border-terminal-border rounded px-2 py-2 text-sm text-terminal-text" />
        </label>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={mint}
          disabled={minting || !sig || !detect?.executorReady}
          title={!detect?.executorReady ? 'Set PRIVATE_KEY + RPC_URL' : 'Mint now'}
          className="border border-terminal-green text-terminal-green rounded px-5 py-2 text-sm hover:bg-terminal-green/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {minting ? 'Minting…' : '⚡ MINT NOW'}
        </button>
        {!detect?.executorReady && <span className="text-[11px] text-terminal-amber">needs PRIVATE_KEY + RPC_URL in the environment</span>}
      </div>

      {error && <p className="text-sm neg mt-2">{error}</p>}
      {result && (
        <div className={`mt-3 text-xs border rounded px-3 py-2 ${result.ok ? 'border-terminal-green text-terminal-green' : 'border-terminal-red neg'}`}>
          {result.ok ? (
            <span>
              ✓ Mint sent ·{' '}
              {result.explorerUrl ? (
                <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="underline">
                  {result.txHash?.slice(0, 12)}… ↗
                </a>
              ) : (
                result.txHash
              )}
            </span>
          ) : (
            <span>✗ {result.error}</span>
          )}
        </div>
      )}
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}
