import { NextResponse } from 'next/server';
import { runRotatingScan } from '@/services/scan';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';
// 60s is valid on every Vercel plan; a rotating batch is sized to fit.
export const maxDuration = 60;

/**
 * Background cron entry point.
 *
 * GET or POST /api/cron/scan?batch=10&discover=0
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
 * Vercel Cron sends this header automatically when the env var exists; external
 * schedulers (GitHub Actions) send it explicitly. If CRON_SECRET is unset the
 * endpoint is open — set it in any deployment you don't want publicly triggerable.
 */
async function handle(request: Request): Promise<NextResponse> {
  if (env.cronSecret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${env.cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!env.opensea.apiKey) {
    return NextResponse.json(
      { error: 'OPENSEA_API_KEY is not configured.' },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const batchParam = Number(url.searchParams.get('batch'));
  const batchSize = Number.isFinite(batchParam) && batchParam > 0 ? batchParam : 10;
  const discover = url.searchParams.get('discover') === '1';

  try {
    const result = await runRotatingScan({ batchSize, discover });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Rotating scan failed' },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
