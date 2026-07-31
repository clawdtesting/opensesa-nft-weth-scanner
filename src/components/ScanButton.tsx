'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ScanButton() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'running' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const run = async () => {
    setState('running');
    setMessage('');
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Scan failed');
      setMessage(`Scanned ${body.scanned}, ${body.opportunities} opportunities`);
      setState('idle');
      router.refresh();
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Scan failed');
    }
  };

  return (
    <div className="text-right">
      <button
        onClick={run}
        disabled={state === 'running'}
        className="bg-terminal-accent/20 border border-terminal-accent text-terminal-accent text-xs px-3 py-1.5 rounded hover:bg-terminal-accent/30 disabled:opacity-50"
      >
        {state === 'running' ? 'Scanning…' : 'Run live scan'}
      </button>
      {message && (
        <p className={`text-xs mt-1 ${state === 'error' ? 'neg' : 'dim'}`}>{message}</p>
      )}
    </div>
  );
}
