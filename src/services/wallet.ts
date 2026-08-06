import 'server-only';
import { env } from '@/config/env';
import { getWalletAddress, getEthBalance, getTokenBalance } from '@/lib/chain/wallet';
import { logger } from '@/lib/logger';

export interface WalletBalances {
  address: string | null;
  /** True when RPC_URL is set (reads use the public RPC otherwise). */
  rpcConfigured: boolean;
  ethBalance: number | null;
  wethBalance: number | null;
  /** True when WETH_ADDRESS is set so a WETH balance can be read. */
  wethConfigured: boolean;
  note?: string;
}

/** Read the configured wallet's native ETH and WETH balances on Robinhood chain. */
export async function getWalletBalances(): Promise<WalletBalances> {
  const address = getWalletAddress();
  const rpcConfigured = Boolean(env.buyer.rpcUrl);
  const wethConfigured = Boolean(env.buyer.wethAddress);

  if (!address) {
    return {
      address: null,
      rpcConfigured,
      ethBalance: null,
      wethBalance: null,
      wethConfigured,
      note: 'PRIVATE_KEY not configured — set it to read wallet balances.',
    };
  }

  let ethBalance: number | null = null;
  try {
    ethBalance = await getEthBalance(address);
  } catch (err) {
    logger.warn('wallet.eth_balance_failed', { error: String(err) });
  }

  let wethBalance: number | null = null;
  if (wethConfigured) {
    wethBalance = await getTokenBalance(env.buyer.wethAddress, address);
  }

  return {
    address,
    rpcConfigured,
    ethBalance,
    wethBalance,
    wethConfigured,
    note: ethBalance === null ? 'Could not reach the RPC to read balances.' : undefined,
  };
}
