/**
 * CLI: run a single scan cycle. Requires OPENSEA_API_KEY.
 *
 * Usage:
 *   npm run scan                                  # top-volume discovery
 *   npm run scan -- --limit=80                    # more candidates
 *   npm run scan -- --maxFloor=0.05              # only collections with floor <= 0.05 ETH
 *   npm run scan -- --maxFloor=0.05 --limit=150  # widen the net to find cheap ones
 *   npm run scan -- --slugs=bayc,azuki           # scan specific collections
 *   npm run scan -- --no-newest                   # skip the newest-collections pass
 */
import { runScan } from '@/services/scan';
import { env } from '@/config/env';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=')[1];
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  if (!env.opensea.apiKey) {
    console.error('OPENSEA_API_KEY is not set. Add it to .env before running a live scan.');
    process.exit(1);
  }
  const limit = arg('limit');
  const maxFloorArg = arg('maxFloor');
  const slugsArg = arg('slugs');
  const slugs = slugsArg ? slugsArg.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const maxFloor = maxFloorArg ? Number(maxFloorArg) : undefined;

  if (maxFloor !== undefined && !Number.isFinite(maxFloor)) {
    console.error(`Invalid --maxFloor value: ${maxFloorArg}`);
    process.exit(1);
  }

  const result = await runScan({
    limit: limit ? Number(limit) : undefined,
    slugs,
    maxFloor,
    // Default to including newest collections when hunting cheap floors; allow opt-out.
    includeNewest: flag('no-newest') ? false : undefined,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
