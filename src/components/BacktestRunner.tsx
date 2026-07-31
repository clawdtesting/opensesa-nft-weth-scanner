'use client';

import { useState } from 'react';
import type { BacktestResult } from '@/services/backtest';
import { formatEth, formatPct } from '@/lib/money';

const DEFAULTS = {
  days: 7,
  startingCapitalEth: 10,
  maxAllocationPerCollectionEth: 3,
  maxConcurrentPositions: 20,
  minScore: 60,
  minExpectedRoi: 5,
  fillWindowHours: 48,
  maxHoldHours: 168,
};

export function BacktestRunner() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [state, setState] = useState<'idle' | 'running' | 'error'>('idle');
  const [error, setError] = useState('');

  const set = (k: keyof typeof DEFAULTS) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg({ ...cfg, [k]: Number(e.target.value) || 0 });

  const run = async () => {
    setState('running');
    setError('');
    try {
      const now = Date.now();
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: new Date(now - cfg.days * 86_400_000).toISOString(),
          end: new Date(now).toISOString(),
          startingCapitalEth: cfg.startingCapitalEth,
          maxAllocationPerCollectionEth: cfg.maxAllocationPerCollectionEth,
          maxConcurrentPositions: cfg.maxConcurrentPositions,
          minScore: cfg.minScore,
          minExpectedRoi: cfg.minExpectedRoi / 100,
          fillWindowHours: cfg.fillWindowHours,
          maxHoldHours: cfg.maxHoldHours,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Backtest failed');
      setResult(body);
      setState('idle');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Backtest failed');
    }
  };

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
        <Field label="Lookback days" value={cfg.days} onChange={set('days')} />
        <Field label="Starting WETH" value={cfg.startingCapitalEth} onChange={set('startingCapitalEth')} />
        <Field label="Max/collection" value={cfg.maxAllocationPerCollectionEth} onChange={set('maxAllocationPerCollectionEth')} />
        <Field label="Max positions" value={cfg.maxConcurrentPositions} onChange={set('maxConcurrentPositions')} />
        <Field label="Min score" value={cfg.minScore} onChange={set('minScore')} />
        <Field label="Min ROI %" value={cfg.minExpectedRoi} onChange={set('minExpectedRoi')} />
        <Field label="Fill window h" value={cfg.fillWindowHours} onChange={set('fillWindowHours')} />
        <Field label="Max hold h" value={cfg.maxHoldHours} onChange={set('maxHoldHours')} />
      </div>
      <button
        onClick={run}
        disabled={state === 'running'}
        className="bg-terminal-accent/20 border border-terminal-accent text-terminal-accent text-xs px-4 py-2 rounded hover:bg-terminal-accent/30 disabled:opacity-50"
      >
        {state === 'running' ? 'Running…' : 'Run backtest'}
      </button>
      {error && <p className="neg text-xs mt-2">{error}</p>}

      {result && <Results result={result} />}
    </div>
  );
}

function Results({ result }: { result: BacktestResult }) {
  const stats: Array<{ label: string; value: string; cls?: string }> = [
    { label: 'Opportunities', value: result.opportunitiesDetected.toString() },
    { label: 'Orders', value: result.ordersSimulated.toString() },
    { label: 'Fills', value: `${result.fills} (${formatPct(result.fillRate)})` },
    { label: 'Net P&L', value: `${formatEth(result.netPnl)} WETH`, cls: result.netPnl >= 0 ? 'pos' : 'neg' },
    { label: 'ROI', value: formatPct(result.roi), cls: result.roi >= 0 ? 'pos' : 'neg' },
    { label: 'Win rate', value: formatPct(result.winRate) },
    { label: 'Max drawdown', value: formatPct(result.maxDrawdown), cls: 'neg' },
    { label: 'Median hold', value: result.medianHoldingHours ? `${result.medianHoldingHours.toFixed(0)}h` : '—' },
  ];
  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {stats.map((s) => (
          <div key={s.label} className="border border-terminal-border rounded p-3 bg-terminal-panel">
            <div className="text-[10px] uppercase tracking-wide text-terminal-muted">{s.label}</div>
            <div className={`text-base mt-1 ${s.cls ?? ''}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <h3 className="text-sm font-semibold mb-2">By collection</h3>
      <div className="overflow-x-auto border border-terminal-border rounded mb-6">
        <table className="terminal">
          <thead>
            <tr>
              <th>Collection</th>
              <th className="num">Trades</th>
              <th className="num">Net P&L</th>
              <th className="num">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {result.byCollection.map((c) => (
              <tr key={c.slug}>
                <td>{c.slug}</td>
                <td className="num">{c.trades}</td>
                <td className={`num ${c.netPnl >= 0 ? 'pos' : 'neg'}`}>{formatEth(c.netPnl)}</td>
                <td className="num">{formatPct(c.winRate)}</td>
              </tr>
            ))}
            {result.byCollection.length === 0 && (
              <tr>
                <td colSpan={4} className="dim" style={{ textAlign: 'center', padding: 16 }}>
                  No trades were executed under these parameters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-terminal-muted">
      {label}
      <input
        type="number"
        value={value}
        onChange={onChange}
        className="bg-terminal-panel border border-terminal-border rounded px-2 py-1 text-terminal-text"
      />
    </label>
  );
}
