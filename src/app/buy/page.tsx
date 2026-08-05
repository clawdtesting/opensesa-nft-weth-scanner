import { SnipeView } from '@/components/SnipeView';

export const dynamic = 'force-dynamic';

export default function BuyPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-terminal-text">Floor Sniper</h1>
        <p className="text-xs text-terminal-muted mt-1">
          Paste a collection&apos;s contract address and hit Fetch to resolve it on OpenSea and read
          its live floor. Around a drop the collection may not be indexed until it goes live — use
          Auto-refetch to poll. One-click on-chain buy (requires PRIVATE_KEY + RPC_URL) lands in the
          next iteration.
        </p>
      </div>
      <SnipeView />
    </div>
  );
}
