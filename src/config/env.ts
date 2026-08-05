/**
 * Server-side environment configuration.
 *
 * IMPORTANT: This module must never be imported from client components. All
 * values here (API keys in particular) are server-only secrets.
 */
import 'server-only';

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  databaseUrl: optional('DATABASE_URL'),
  opensea: {
    apiKey: optional('OPENSEA_API_KEY'),
    baseUrl: optional('OPENSEA_API_BASE', 'https://api.opensea.io/api/v2'),
    chain: optional('OPENSEA_CHAIN', 'ethereum'),
    maxRps: num('OPENSEA_MAX_RPS', 4),
  },
  // OpenSea chain identifier for the Robinhood tab. Isolated from the main
  // scanner chain so the Robinhood feed can target a different network.
  robinhoodChain: optional('ROBINHOOD_CHAIN', 'robinhood'),
  // How many newest Robinhood collections to fetch + enrich per refresh.
  // Higher = more coverage but more OpenSea calls (each collection costs a few),
  // so keep it within the API route's time budget. Max useful value is 100
  // (OpenSea's per-page cap for the collections endpoint).
  robinhoodLimit: num('ROBINHOOD_LIMIT', 50),
  discoveryLimit: num('DISCOVERY_LIMIT', 60),
  cronSecret: optional('CRON_SECRET'),
  // Buyer / one-click floor purchase (server-only secrets — NEVER expose these
  // to the client or serialize them in any API response). PRIVATE_KEY signs the
  // fulfillment transaction; RPC_URL is the node the signed tx is broadcast to.
  // Both are only needed for on-chain execution, not for fetching a collection.
  buyer: {
    privateKey: optional('PRIVATE_KEY'),
    rpcUrl: optional('RPC_URL'),
  },
  seedSlugs: optional('SCAN_SEED_SLUGS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  nodeEnv: optional('NODE_ENV', 'development'),
} as const;

export function assertOpenseaConfigured(): void {
  if (!env.opensea.apiKey) {
    throw new Error(
      'OPENSEA_API_KEY is not set. Live ingestion requires an OpenSea API key (server-side only).',
    );
  }
}

/** True when the wallet credentials required to execute an on-chain buy exist. */
export function buyerReady(): boolean {
  return Boolean(env.buyer.privateKey && env.buyer.rpcUrl);
}
