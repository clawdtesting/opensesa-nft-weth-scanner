import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'WETH Liquidity Scanner',
  description: 'OpenSea NFT WETH spread, liquidity & risk-adjusted opportunity engine',
};

const NAV = [
  { href: '/buy', label: 'NFT BUY' },
  { href: '/', label: 'Opportunities' },
  { href: '/drops', label: 'Drops' },
  { href: '/robinhood', label: 'Robinhood' },
  { href: '/portfolio', label: 'Paper Portfolio' },
  { href: '/backtest', label: 'Backtest' },
  { href: '/diagnostics', label: 'Diagnostics' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-mono min-h-screen">
        <header className="border-b border-terminal-border bg-terminal-panel">
          <div className="flex items-center gap-6 px-5 h-12">
            <Link href="/" className="text-terminal-accent font-semibold tracking-tight">
              ⬡ WETH&nbsp;SCANNER
            </Link>
            <nav className="flex gap-4 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-terminal-muted hover:text-terminal-text">
                  {n.label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto text-xs text-terminal-muted">
              simulation only · no real-money execution
            </span>
          </div>
        </header>
        <main className="p-5">{children}</main>
      </body>
    </html>
  );
}
