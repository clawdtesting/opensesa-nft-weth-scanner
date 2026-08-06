import { SnipeView } from '@/components/SnipeView';
import { TokenPanel } from '@/components/TokenPanel';
import { WalletBalances } from '@/components/WalletBalances';

export const dynamic = 'force-dynamic';

export default function BuyPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-terminal-text">NFT Buy</h1>
        <p className="text-xs text-terminal-muted mt-1">
          Robinhood chain. Paste a collection contract to read its live floor/offer spread, or a
          token contract to chart its price and (soon) swap. Balances and the one-click buy require
          PRIVATE_KEY + RPC_URL to be configured.
        </p>
      </div>

      {/* Wallet balances sit above the collection contract box. */}
      <div className="max-w-3xl">
        <WalletBalances />
      </div>

      <SnipeView />
      <TokenPanel />
    </div>
  );
}
