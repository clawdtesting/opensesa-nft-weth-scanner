import { BacktestRunner } from '@/components/BacktestRunner';

export const dynamic = 'force-dynamic';

export default function BacktestPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Backtest</h1>
      <p className="text-xs text-terminal-muted mb-4">
        Signals come from stored market snapshots; fills and exits are resolved against the actual
        sales that followed. Requires a snapshot history (seed data or accumulated live scans).
      </p>
      <BacktestRunner />
    </div>
  );
}
