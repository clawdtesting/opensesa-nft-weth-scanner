import 'server-only';
import { defineChain } from 'viem';
import { env } from '@/config/env';

/** Public fallback RPC when RPC_URL is not configured. */
const PUBLIC_RPC = 'https://rpc.mainnet.chain.robinhood.com';

/**
 * Robinhood Chain (mainnet) — Arbitrum Orbit L2, chain id 4663, ETH for gas.
 * The RPC URL comes from RPC_URL when set, otherwise the rate-limited public
 * endpoint (fine for reads, not ideal under drop-time load).
 */
export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [env.buyer.rpcUrl || PUBLIC_RPC] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
});
