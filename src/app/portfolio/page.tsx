import { getPaperPortfolio } from '@/services/papertrading';
import { prisma } from '@/lib/db';
import { formatEth, formatPct } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const portfolio = await getPaperPortfolio();
  const positions = await prisma.simulatedPosition.findMany({
    where: { runId: null },
    orderBy: { entryAt: 'desc' },
    take: 50,
    include: { order: { include: { collection: true } } },
  });

  const stats: Array<{ label: string; value: string; cls?: string }> = [
    { label: 'Capital Allocated', value: `${formatEth(portfolio.capitalAllocated)} WETH` },
    { label: 'Open Positions', value: portfolio.openPositions.toString() },
    { label: 'Closed Positions', value: portfolio.closedPositions.toString() },
    {
      label: 'Total Net P&L',
      value: `${formatEth(portfolio.totalNetPnl)} WETH`,
      cls: portfolio.totalNetPnl >= 0 ? 'pos' : 'neg',
    },
    { label: 'Win Rate', value: formatPct(portfolio.winRate) },
    { label: 'Average ROI', value: formatPct(portfolio.averageRoi) },
    {
      label: 'Median Hold',
      value: portfolio.medianHoldingHours ? `${portfolio.medianHoldingHours.toFixed(0)}h` : '—',
    },
  ];

  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Simulated Portfolio</h1>
      <p className="text-xs text-terminal-muted mb-4">
        Paper trades only. No WETH is deployed and no orders are signed — this proves whether the
        strategy has an edge before any real execution engine is connected.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="border border-terminal-border rounded p-3 bg-terminal-panel">
            <div className="text-[10px] uppercase tracking-wide text-terminal-muted">{s.label}</div>
            <div className={`text-base mt-1 ${s.cls ?? ''}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto border border-terminal-border rounded">
        <table className="terminal">
          <thead>
            <tr>
              <th>Collection</th>
              <th>Status</th>
              <th className="num">Entry</th>
              <th className="num">Exit</th>
              <th className="num">Net P&L</th>
              <th className="num">ROI</th>
              <th className="num">Hold h</th>
              <th>Entered</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id}>
                <td>{p.order.collection.name}</td>
                <td className={p.status === 'CLOSED' ? 'dim' : 'pos'}>{p.status}</td>
                <td className="num">{formatEth(p.entryEth)}</td>
                <td className="num">{formatEth(p.exitEth)}</td>
                <td className={`num ${(p.netProfit ?? 0) >= 0 ? 'pos' : 'neg'}`}>{formatEth(p.netProfit)}</td>
                <td className={`num ${(p.roi ?? 0) >= 0 ? 'pos' : 'neg'}`}>{formatPct(p.roi)}</td>
                <td className="num">{p.holdingHours ? p.holdingHours.toFixed(0) : '—'}</td>
                <td className="dim">{p.entryAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
            {positions.length === 0 && (
              <tr>
                <td colSpan={8} className="dim" style={{ textAlign: 'center', padding: 24 }}>
                  No paper positions yet. Run a scan or seed the database.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
