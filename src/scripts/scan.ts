/**
 * CLI: run a single scan cycle. Requires OPENSEA_API_KEY.
 * Usage: npm run scan [-- --limit=40] [-- --slugs=bayc,azuki]
 */
import { runScan } from '@/services/scan';
import { env } from '@/config/env';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=')[1];
}

async function main() {
  if (!env.opensea.apiKey) {
    console.error('OPENSEA_API_KEY is not set. Add it to .env before running a live scan.');
    process.exit(1);
  }
  const limit = arg('limit');
  const slugsArg = arg('slugs');
  const slugs = slugsArg ? slugsArg.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

  const result = await runScan({ limit: limit ? Number(limit) : undefined, slugs });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
