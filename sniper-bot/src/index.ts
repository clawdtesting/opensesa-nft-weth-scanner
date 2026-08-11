import { getAddress, type Address, type AbiEvent } from 'viem';
import { config, validateConfig } from './config.js';
import { publicWs } from './clients.js';
import { buyToken } from './buyer.js';
import { dexscreenerHasPair } from './backup.js';
import { notify } from './notify.js';
import { log } from './logger.js';
import { PAIR_CREATED_SOLIDLY, PAIR_CREATED_V2, POOL_CREATED_V3 } from './abis.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How often the buy loop re-quotes the router while waiting for liquidity. */
const POLL_MS = 1_500;
/** Give up watching a token after this long. */
const MAX_WATCH_MS = 60 * 60 * 1000;

const targets = new Set(config.targetTokens.map((a) => a.toLowerCase()));
const bought = new Set<string>();
const inProgress = new Set<string>();

async function main() {
  const problems = validateConfig();
  if (problems.length) {
    log.error('Configuration problems — fix these in .env:');
    problems.forEach((p) => log.error('  - ' + p));
    process.exit(1);
  }
  printSummary();

  // On-chain event watchers (real-time pool creation) — informational + a nudge.
  startFactoryWatchers();

  // Backup: Dexscreener polling.
  if (config.dexscreenerEnabled) startDexscreenerBackup();

  // Core: for every target, poll the router quote until liquidity exists, then buy.
  for (const t of config.targetTokens) void buyLoop(t);

  process.on('SIGINT', () => {
    log.info('Shutting down.');
    process.exit(0);
  });
}

/** Poll the router until the token can be bought (liquidity), then buy once. */
async function buyLoop(token: Address) {
  const key = token.toLowerCase();
  if (inProgress.has(key)) return;
  inProgress.add(key);
  log.info(`Watching ${token} — will buy ${config.buyAmountEth} ETH worth once its pool is live.`);

  const started = Date.now();
  let announcedLive = false;
  while (!bought.has(key) && Date.now() - started < MAX_WATCH_MS) {
    const r = await buyToken(token);
    if (r.ok) {
      bought.add(key);
      log.ok(`${config.dryRun ? 'DRY_RUN buy validated' : 'BOUGHT'} ${token}${r.txHash ? ` (${r.txHash})` : ''}`);
      break;
    }
    // First time a quote succeeds enough to prove liquidity but a non-liquidity
    // revert stops us, surface the reason once so the user can tweak config.
    if (r.reason && !/no liquidity|gas above cap/i.test(r.reason) && !announcedLive) {
      announcedLive = true;
      log.warn(`Buy attempt returned: ${r.reason}`);
    }
    await sleep(POLL_MS);
  }
  inProgress.delete(key);
  if (!bought.has(key)) log.warn(`Stopped watching ${token} after ${Math.round(MAX_WATCH_MS / 60000)} min.`);
}

/** Watch the configured factories for pool-creation events involving a target. */
function startFactoryWatchers() {
  const v2 = config.v2Factories;
  const v3 = config.v3Factories;
  if (v2.length) {
    watch(v2, PAIR_CREATED_SOLIDLY, 'up./solidly PairCreated');
    watch(v2, PAIR_CREATED_V2, 'v2 PairCreated');
  }
  if (v3.length) watch(v3, POOL_CREATED_V3, 'v3 PoolCreated');
  if (!v2.length && !v3.length) {
    log.warn('No factory addresses configured — relying on router-quote polling + Dexscreener. Add UP_V2_FACTORY for instant detection (see README).');
  }
}

function watch(addresses: readonly Address[], event: AbiEvent, label: string) {
  publicWs.watchEvent({
    address: [...addresses],
    event,
    onLogs: (logs) => {
      for (const l of logs) {
        const a = l.args as { token0?: Address; token1?: Address; pair?: Address; pool?: Address };
        const t0 = a.token0?.toLowerCase();
        const t1 = a.token1?.toLowerCase();
        const match = (t0 && targets.has(t0)) || (t1 && targets.has(t1));
        if (!match) continue;
        const token = getAddress((targets.has(t0 ?? '') ? t0 : t1) as string);
        const poolAddr = a.pair ?? a.pool;
        log.hit(`Pool created for ${token} (${label})${poolAddr ? ` pool=${poolAddr}` : ''}`);
        void notify(`🎯 Pool detected for ${token}\n${label}${poolAddr ? `\npool: ${poolAddr}` : ''}`);
        void buyLoop(token); // no-op if already in progress/bought
      }
    },
    onError: (err) => log.warn(`${label} watcher error (will auto-resubscribe): ${err.message}`),
  });
  log.info(`Watching ${addresses.length} factory address(es) for ${label}.`);
}

/** Poll Dexscreener as a backup signal that a pool went live. */
function startDexscreenerBackup() {
  log.info(`Dexscreener backup polling every ${config.dexscreenerPollMs}ms.`);
  setInterval(async () => {
    for (const token of config.targetTokens) {
      const key = token.toLowerCase();
      if (bought.has(key)) continue;
      if (await dexscreenerHasPair(token)) {
        log.hit(`Dexscreener shows a live pair for ${token}.`);
        void buyLoop(token);
      }
    }
  }, config.dexscreenerPollMs);
}

function printSummary() {
  log.info('--- Robinhood up. sniper ---');
  log.info(`Mode:        ${config.dryRun ? 'DRY_RUN (no funds spent)' : '*** LIVE — will spend real ETH ***'}`);
  log.info(`Targets:     ${config.targetTokens.join(', ') || '(none)'}`);
  log.info(`Buy amount:  ${config.buyAmountEth} ETH   slippage ${Number(config.slippageBps) / 100}%   maxGas ${config.maxGasGwei} gwei`);
  log.info(`Router:      ${config.routerStyle} @ ${config.upRouter ?? config.univ3SwapRouter ?? '(unset)'}`);
  log.info(`Factories:   v2=[${config.v2Factories.join(',') || '-'}] v3=[${config.v3Factories.join(',') || '-'}]`);
  log.info(`RPC:         ws=${config.rpcWs ? 'yes' : 'no (http polling)'} http=${config.rpcHttp}`);
  if (config.dryRun) log.warn('DRY_RUN is ON — verify the quote/simulation output, then set DRY_RUN=false to arm real buys.');
}

main().catch((err) => {
  log.error('Fatal', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
