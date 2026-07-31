import { NextResponse } from 'next/server';
import { runBacktest, type BacktestConfig } from '@/services/backtest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DAY = 86_400_000;

/** POST /api/backtest — run a snapshot-driven backtest with the supplied config. */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // empty body → use defaults
  }

  const now = Date.now();
  const num = (k: string, fallback: number): number => {
    const v = body[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  };

  const config: BacktestConfig = {
    start: body.start ? new Date(String(body.start)) : new Date(now - 7 * DAY),
    end: body.end ? new Date(String(body.end)) : new Date(now),
    startingCapitalEth: num('startingCapitalEth', 10),
    maxAllocationPerCollectionEth: num('maxAllocationPerCollectionEth', 3),
    maxConcurrentPositions: num('maxConcurrentPositions', 20),
    minScore: num('minScore', 60),
    minExpectedRoi: num('minExpectedRoi', 0.05),
    fillWindowHours: num('fillWindowHours', 48),
    maxHoldHours: num('maxHoldHours', 168),
  };

  try {
    const result = await runBacktest(config);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Backtest failed' },
      { status: 500 },
    );
  }
}
