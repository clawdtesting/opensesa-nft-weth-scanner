import { RobinhoodView } from '@/components/RobinhoodView';

export const dynamic = 'force-dynamic';

export default function RobinhoodPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-terminal-text">Robinhood</h1>
        <p className="text-xs text-terminal-muted mt-1">
          Newly minted collections on the Robinhood chain. Filter by holders, item count and
          24h/96h traded volume. 96h volume is summed best-effort from recent sale events.
        </p>
      </div>
      <RobinhoodView />
    </div>
  );
}
