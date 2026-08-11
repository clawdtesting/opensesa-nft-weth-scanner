import { createPublicClient, createWalletClient, http, webSocket, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config, robinhoodChain } from './config.js';

const pk = (config.privateKey.startsWith('0x') ? config.privateKey : `0x${config.privateKey}`) as `0x${string}`;

/** Account derived from PRIVATE_KEY (may be a dummy in a pure dry-run env). */
export const account = config.privateKey ? privateKeyToAccount(pk) : undefined;

/** HTTP client for reads, quotes and sending transactions. */
export const publicHttp: PublicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(config.rpcHttp),
});

/**
 * WebSocket client for real-time event subscriptions. viem auto-reconnects the
 * socket; if no RPC_WS is set we fall back to the HTTP client (watchEvent then
 * polls, which still works — just less immediate).
 */
export const publicWs: PublicClient = config.rpcWs
  ? createPublicClient({
      chain: robinhoodChain,
      transport: webSocket(config.rpcWs, { reconnect: { attempts: 20, delay: 2_000 }, retryCount: 5 }),
    })
  : publicHttp;

export const walletClient: WalletClient | undefined = account
  ? createWalletClient({ account, chain: robinhoodChain, transport: http(config.rpcHttp) })
  : undefined;
