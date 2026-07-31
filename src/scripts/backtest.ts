/**
 * CLI: run a backtest against stored snapshots.
 * Usage: npm run backtest [-- --days=7 --capital=10 --minScore=60 --minRoi=0.05]
 */
import { runBacktest } from '@/services/backtest';

function num(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const v = Number(hit.split('=')[1]);
  return Number.isFinite(v) ? v : fallback;
}

async function main() {
  const days = num('days', 7);
  const now = Date.now();
  const result = await runBacktest({
    start: new Date(now - days * 86_400_000),
    end: new Date(now),
    startingCapitalEth: num('capital', 10),
    maxAllocationPerCollectionEth: num('maxPerCollection', 3),
    maxConcurrentPositions: num('maxPositions', 20),
    minScore: num('minScore', 60),
    minExpectedRoi: num('minRoi', 0.05),
    fillWindowHours: num('fillWindow', 48),
    maxHoldHours: num('maxHold', 168),
  });
  console.log(JSON.stringify({ ...result, trades: `${result.trades.length} trades (omitted)` }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
