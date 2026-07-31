import { DropsView } from '@/components/DropsView';

export const dynamic = 'force-dynamic';

export default function DropsPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-terminal-text">Drops / Mints</h1>
        <p className="text-xs text-terminal-muted mt-1">
          Ethereum-only mint discovery. Recently Minted uses OpenSea&apos;s official API and is
          enriched with scanner metrics; Upcoming &amp; Featured use OpenSea&apos;s drops feed and
          degrade gracefully if it is unavailable.
        </p>
      </div>
      <DropsView />
    </div>
  );
}
