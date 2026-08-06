'use client';

import { useCallback, useEffect, useState } from 'react';

interface Balances {
  address: string | null;
  rpcConfigured: boolean;
  ethBalance: number | null;
  wethBalance: number | null;
  wethConfigured: boolean;
  note?: string;
}

export function WalletBalances() {
  const [bal, setBal] = useState<Balances | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet');
      if (res.ok) setBal(await res.json());
    } catch {
      /* transient — keep last value */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="flex items-center gap-4 border border-terminal-border rounded bg-terminal-panel px-4 py-2 mb-4 text-sm">
      <span className="text-[10px] uppercase tracking-wide text-terminal-muted">Wallet</span>
      <Bal label="ETH" value={bal?.ethBalance} />
      <Bal label="WETH" value={bal?.wethBalance} unconfigured={bal ? !bal.wethConfigured : false} />
      <span className="ml-auto text-[11px] text-terminal-muted font-mono truncate max-w-[220px]" title={bal?.address ?? undefined}>
        {bal?.address ? short(bal.address) : bal?.note ?? '—'}
      </span>
    </div>
  );
}

function Bal({ label, value, unconfigured }: { label: string; value: number | null | undefined; unconfigured?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-terminal-muted text-[11px]">{label}</span>
      <span className="font-mono text-terminal-text">
        {unconfigured ? 'set WETH_ADDRESS' : value === null || value === undefined ? '—' : value.toFixed(4)}
      </span>
    </span>
  );
}

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
