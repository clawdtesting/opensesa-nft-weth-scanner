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
      // The endpoint can return a non-JSON error page (e.g. a platform timeout),
      // so read text first and parse defensively instead of assuming JSON.
      const raw = await res.text();
      let body: { scanned?: number; opportunities?: number; error?: string } | null = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }

      if (!res.ok || !body) {
        const reason =
          body?.error ??
          (res.status === 504 || /timed? out|timeout/i.test(raw)
            ? 'Scan timed out on the server. Try a smaller batch, or run `npm run scan` from a terminal.'
            : `Scan failed (HTTP ${res.status}).`);
        throw new Error(reason);
      }

      setMessage(`Scanned ${body.scanned ?? 0}, ${body.opportunities ?? 0} opportunities`);
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
