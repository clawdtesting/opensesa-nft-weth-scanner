import { formatEther, parseEther, parseGwei, zeroAddress, type Address } from 'viem';
import { config, EXPLORER_TX } from './config.js';
import { publicHttp, walletClient, account } from './clients.js';
import { log } from './logger.js';
import { notify } from './notify.js';
import {
  VELODROME_ROUTER_ABI,
  SOLIDLY_ROUTER_ABI,
  UNIV2_ROUTER_ABI,
  UNIV3_ROUTER_ABI,
  UNIV3_QUOTER_ABI,
} from './abis.js';

export interface BuyOutcome {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  txHash?: string;
  expectedOut?: bigint;
}

/** Apply the slippage tolerance to a quoted output amount. */
function minOut(out: bigint): bigint {
  return (out * (10_000n - config.slippageBps)) / 10_000n;
}

function deadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000)) + config.deadlineSeconds;
}

/** Refuse to send while network gas price is above the configured ceiling. */
async function gasOk(): Promise<boolean> {
  try {
    const price = await publicHttp.getGasPrice();
    const cap = parseGwei(String(config.maxGasGwei));
    if (price > cap) {
      log.warn(`Gas ${formatEther(price * 10n ** 9n)} (${price} wei) above cap ${config.maxGasGwei} gwei — skipping for now.`);
      return false;
    }
    return true;
  } catch {
    return true; // don't block on a gas-read hiccup
  }
}

/**
 * Buy `token` with `BUY_AMOUNT_ETH` of native ETH via the configured router.
 * Quotes first (which also proves the pool has liquidity), applies slippage,
 * simulates, then — unless DRY_RUN — sends the swap.
 */
export async function buyToken(token: Address): Promise<BuyOutcome> {
  if (!account || !walletClient) return { ok: false, reason: 'No wallet configured.' };
  const amountIn = parseEther(config.buyAmountEth);
  const to = account.address;

  if (!(await gasOk())) return { ok: false, skipped: true, reason: 'gas above cap' };

  try {
    switch (config.routerStyle) {
      case 'velodrome':
      case 'solidly':
        return await buySolidly(token, amountIn, to);
      case 'univ2':
        return await buyUniV2(token, amountIn, to);
      case 'univ3':
        return await buyUniV3(token, amountIn, to);
      default:
        return { ok: false, reason: `Unknown ROUTER_STYLE ${config.routerStyle}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A revert here usually means "no liquidity yet" — caller keeps polling.
    return { ok: false, reason: msg.slice(0, 200) };
  }
}

// --- ve(3,3) / Solidly ------------------------------------------------------

async function buySolidly(token: Address, amountIn: bigint, to: Address): Promise<BuyOutcome> {
  const router = config.upRouter!;
  const withFactory = config.routerStyle === 'velodrome';
  const abi = withFactory ? VELODROME_ROUTER_ABI : SOLIDLY_ROUTER_ABI;

  // Route WETH -> token. Try the configured stable flag first, then the other.
  const buildRoute = (stable: boolean) =>
    withFactory
      ? [{ from: config.weth, to: token, stable, factory: config.routeFactory ?? zeroAddress }]
      : [{ from: config.weth, to: token, stable }];

  for (const stable of [config.stablePool, !config.stablePool]) {
    const routes = buildRoute(stable);
    let out: bigint;
    try {
      const amounts = (await publicHttp.readContract({
        address: router,
        abi,
        functionName: 'getAmountsOut',
        args: [amountIn, routes as never],
      })) as bigint[];
      out = amounts[amounts.length - 1] ?? 0n;
    } catch {
      continue; // this stable/volatile pool doesn't exist — try the other
    }
    if (out <= 0n) continue;

    const args = [minOut(out), routes as never, to, deadline()] as const;
    return finish(router, abi, 'swapExactETHForTokens', args, amountIn, out, token, `${withFactory ? 'velodrome' : 'solidly'} stable=${stable}`);
  }
  return { ok: false, reason: 'no liquidity on stable or volatile route' };
}

// --- Uniswap V2 -------------------------------------------------------------

async function buyUniV2(token: Address, amountIn: bigint, to: Address): Promise<BuyOutcome> {
  const router = config.upRouter!;
  const path = [config.weth, token];
  const amounts = (await publicHttp.readContract({
    address: router,
    abi: UNIV2_ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [amountIn, path],
  })) as bigint[];
  const out = amounts[amounts.length - 1] ?? 0n;
  if (out <= 0n) return { ok: false, reason: 'no liquidity' };

  const args = [minOut(out), path, to, deadline()] as const;
  return finish(router, UNIV2_ROUTER_ABI, 'swapExactETHForTokensSupportingFeeOnTransferTokens', args, amountIn, out, token, 'univ2');
}

// --- Uniswap V3 -------------------------------------------------------------

async function buyUniV3(token: Address, amountIn: bigint, to: Address): Promise<BuyOutcome> {
  const router = config.univ3SwapRouter!;
  const quoter = config.univ3Quoter!;
  const fee = config.univ3Fee;

  const quote = await publicHttp.simulateContract({
    address: quoter,
    abi: UNIV3_QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: [{ tokenIn: config.weth, tokenOut: token, amountIn, fee, sqrtPriceLimitX96: 0n }],
  });
  const out = (quote.result as readonly bigint[])[0] ?? 0n;
  if (out <= 0n) return { ok: false, reason: 'no liquidity' };

  const params = {
    tokenIn: config.weth,
    tokenOut: token,
    fee,
    recipient: to,
    deadline: deadline(),
    amountIn,
    amountOutMinimum: minOut(out),
    sqrtPriceLimitX96: 0n,
  };
  return finish(router, UNIV3_ROUTER_ABI, 'exactInputSingle', [params] as const, amountIn, out, token, `univ3 fee=${fee}`);
}

// --- Shared simulate + send -------------------------------------------------

async function finish(
  address: Address,
  abi: unknown,
  functionName: string,
  args: readonly unknown[],
  value: bigint,
  expectedOut: bigint,
  token: Address,
  via: string,
): Promise<BuyOutcome> {
  const common = {
    address,
    abi: abi as never,
    functionName: functionName as never,
    args: args as never,
    value,
    account: account!,
    ...(config.gasLimit ? { gas: config.gasLimit } : {}),
  };

  // Simulate first — reverts here never spend gas.
  await publicHttp.simulateContract(common as never);

  log.hit(`Quote via ${via}: ${config.buyAmountEth} ETH -> ~${expectedOut} units of ${token} (minOut ${minOut(expectedOut)})`);

  if (config.dryRun) {
    log.ok(`DRY_RUN — simulation passed, not sending. Set DRY_RUN=false to execute.`);
    return { ok: true, expectedOut };
  }

  const hash = await walletClient!.writeContract(common as never);
  log.ok(`Buy sent: ${EXPLORER_TX}${hash}`);
  await notify(`🟢 BUY sent for ${token}\n${config.buyAmountEth} ETH via ${via}\n${EXPLORER_TX}${hash}`);

  const receipt = await publicHttp.waitForTransactionReceipt({ hash, timeout: 120_000 }).catch(() => null);
  if (receipt) log.ok(`Buy ${receipt.status} in block ${receipt.blockNumber}: ${EXPLORER_TX}${hash}`);
  return { ok: true, txHash: hash, expectedOut };
}
