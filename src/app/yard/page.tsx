import { TokenPanel } from '@/components/TokenPanel';
import { WalletBalances } from '@/components/WalletBalances';

export const dynamic = 'force-dynamic';

// $YARD on Robinhood chain.
const YARD = '0xe3fa12da7fa026b21817f16622e8ae48fa785166';

export default function YardPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-terminal-text">$YARD</h1>
        <p className="text-xs text-terminal-muted mt-1">
          Live watch for $YARD on Robinhood chain — deployment, whether trading has started, and the
          transfer count, updating every 5s.
        </p>
        <p className="text-[11px] text-terminal-muted mt-1 font-mono break-all">{YARD}</p>
      </div>

      <div className="max-w-3xl">
        <WalletBalances />
      </div>

      <TokenPanel initialAddress={YARD} />
    </div>
  );
}
