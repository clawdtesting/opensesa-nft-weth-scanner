import 'dotenv/config';
import { defineChain, getAddress, isAddress, type Address } from 'viem';

/** Parse a comma-separated list of addresses (checksummed, deduped). */
function addrList(raw: string | undefined): Address[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => isAddress(s.toLowerCase()))
    .map((s) => getAddress(s.toLowerCase()));
}

function bool(raw: string | undefined, fallback = false): boolean {
  if (raw === undefined || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function optAddr(raw: string | undefined): Address | null {
  const s = (raw ?? '').trim().toLowerCase();
  return isAddress(s) ? getAddress(s) : null;
}

export type RouterStyle = 'velodrome' | 'solidly' | 'univ2' | 'univ3';

export const config = {
  rpcWs: (process.env.RPC_WS ?? '').trim() || null,
  rpcHttp: (process.env.RPC_HTTP ?? '').trim() || 'https://rpc.mainnet.chain.robinhood.com',
  privateKey: (process.env.PRIVATE_KEY ?? '').trim(),

  targetTokens: addrList(process.env.TARGET_TOKENS),

  buyAmountEth: (process.env.BUY_AMOUNT_ETH ?? '0.05').trim(),
  slippageBps: BigInt(Math.round(num(process.env.SLIPPAGE_BPS, 500))),
  maxGasGwei: num(process.env.MAX_GAS_GWEI, 5),
  gasLimit: process.env.GAS_LIMIT ? BigInt(process.env.GAS_LIMIT) : undefined,
  deadlineSeconds: BigInt(Math.round(num(process.env.DEADLINE_SECONDS, 60))),
  dryRun: bool(process.env.DRY_RUN, true),

  weth: getAddress((process.env.WETH_ADDRESS ?? '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73').toLowerCase()),

  routerStyle: ((process.env.ROUTER_STYLE ?? 'velodrome').trim() as RouterStyle),
  upRouter: optAddr(process.env.UP_ROUTER),
  v2Factories: [...addrList(process.env.UP_V2_FACTORY), ...addrList(process.env.EXTRA_V2_FACTORIES)],
  v3Factories: [...addrList(process.env.UP_V3_FACTORY), ...addrList(process.env.EXTRA_V3_FACTORIES)],
  routeFactory: optAddr(process.env.ROUTE_FACTORY),
  stablePool: bool(process.env.STABLE_POOL, false),
  univ3Fee: num(process.env.UNIV3_FEE, 3000),
  univ3Quoter: optAddr(process.env.UNIV3_QUOTER),
  univ3SwapRouter: optAddr(process.env.UNIV3_SWAP_ROUTER),

  dexscreenerEnabled: bool(process.env.DEXSCREENER_ENABLED, true),
  dexscreenerPollMs: num(process.env.DEXSCREENER_POLL_MS, 4000),
  dexscreenerChain: (process.env.DEXSCREENER_CHAIN ?? '').trim() || null,

  telegramBotToken: (process.env.TELEGRAM_BOT_TOKEN ?? '').trim() || null,
  telegramChatId: (process.env.TELEGRAM_CHAT_ID ?? '').trim() || null,
  discordWebhook: (process.env.DISCORD_WEBHOOK ?? '').trim() || null,

  takeProfitMult: num(process.env.TAKE_PROFIT_MULT, 0),
  sellPct: num(process.env.SELL_PCT, 50),
} as const;

/** Robinhood Chain (Arbitrum Orbit L2, chain id 4663, ETH gas). */
export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [config.rpcHttp],
      webSocket: config.rpcWs ? [config.rpcWs] : undefined,
    },
  },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } },
});

export const EXPLORER_TX = 'https://robinhoodchain.blockscout.com/tx/';

/** Fail fast on missing critical config, with a readable summary. */
export function validateConfig(): string[] {
  const problems: string[] = [];
  if (!config.privateKey) problems.push('PRIVATE_KEY is required.');
  if (config.targetTokens.length === 0) problems.push('TARGET_TOKENS must contain at least one valid address.');
  if (!config.upRouter && config.routerStyle !== 'univ3') problems.push('UP_ROUTER is required to execute buys.');
  if (config.routerStyle === 'univ3' && (!config.univ3SwapRouter || !config.univ3Quoter))
    problems.push('univ3 style needs UNIV3_SWAP_ROUTER and UNIV3_QUOTER.');
  // Note: no factories + no Dexscreener is allowed — the router-quote poll loop
  // still detects liquidity and buys. Factories only add instant event detection.
  return problems;
}
