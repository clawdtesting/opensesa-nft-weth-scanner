# Robinhood Chain — up. DEX Sniper

A standalone Node.js/TypeScript bot that watches for a **new liquidity pool** for
a target token on **Robinhood Chain (chain id 4663)** — primarily on the **up.**
ve(3,3) DEX (`up33.xyz` / `@uponrh`) — and **auto-buys** with native ETH the
moment the pool has liquidity.

> ⚠️ **This spends real money and interacts with brand-new, unaudited tokens.**
> Use a **dedicated burner wallet** with only the ETH you're willing to lose.
> Keep `DRY_RUN=true` until you've verified the addresses and seen a clean
> simulation. Sniping is inherently risky (rugs, honeypots, failed buys).

## How it works

1. **Detection (belt & suspenders):**
   - **Router-quote polling (primary, most robust):** every ~1.5s it asks the up.
     router `getAmountsOut(0.05 ETH → TARGET)`. That call only succeeds once the
     pool exists **and has liquidity** — so it doubles as the liquidity gate. This
     works even if you never find the factory address.
   - **Factory events (optional, fastest):** subscribes via WebSocket to
     `PairCreated` (ve(3,3)/v2) and `PoolCreated` (v3) on the factories you
     configure, filtered to your token — for instant detection + notification.
   - **Dexscreener polling (backup):** flags a live pair if/when it's indexed.
2. **Buy:** quotes the output, applies your slippage to get `minOut`, **simulates**
   the swap (a revert here costs nothing), then — unless `DRY_RUN` — sends
   `swapExactETHForTokens` (ve(3,3)/solidly) / the V2 / V3 equivalent, and prints
   the tx hash + Blockscout link.

## Prerequisites

- Node.js 18+.
- A funded **burner** wallet private key.
- Ideally a **WebSocket RPC** for Robinhood Chain (Alchemy or QuickNode) — much
  faster than the public HTTP endpoint and not rate-limited.

### Get an Alchemy (or QuickNode) key

1. Create a free account at <https://alchemy.com> (or <https://quicknode.com>).
2. Create an app / endpoint and pick **Robinhood Chain (mainnet)**.
3. Copy the **WSS** URL into `RPC_WS` and the **HTTPS** URL into `RPC_HTTP` in `.env`.

## Setup

```bash
cd sniper-bot
npm install
cp .env.example .env
# edit .env — see the field comments
npm run typecheck   # optional sanity check
npm start           # runs in DRY_RUN by default
```

## Finding the up. factory & router addresses (IMPORTANT)

The bot needs the up. **router** to buy, and (optionally) the **factory** to get
instant event detection. These aren't hard-coded because they can change. To find
them on <https://robinhoodchain.blockscout.com>:

1. Open the up. app (`up33.xyz`), do (or start) any swap, and in your wallet look
   at the **contract you're interacting with** — that's the **router**. Put it in
   `UP_ROUTER`.
2. On Blockscout, open the router address → **Contract** tab. ve(3,3) routers
   expose a `factory()` / `defaultFactory()` read method — call it to get the
   **PairFactory**. Put that in `UP_V2_FACTORY` **and** `ROUTE_FACTORY`.
3. Confirm the router style:
   - If the router's `getAmountsOut` takes `Route[]` with a `factory` field →
     `ROUTER_STYLE="velodrome"` (the default).
   - If routes are `(from,to,stable)` with no factory → `ROUTER_STYLE="solidly"`.
   - Plain Uniswap V2 fork → `ROUTER_STYLE="univ2"`; Uniswap V3 → `"univ3"`
     (also set `UNIV3_SWAP_ROUTER`, `UNIV3_QUOTER`, `UNIV3_FEE`).
4. If you can't find the factory, that's OK — leave it blank. The **router-quote
   polling** path still detects liquidity and buys; you just lose the instant
   event notification.

> Tip: verify by running with `DRY_RUN=true`. Once the pool is live the log prints
> a real quote (`X ETH -> ~Y units`). If you only ever see "no liquidity", the
> pool isn't live yet or the router/token/stable-flag config is off.

## Going live

1. Run in `DRY_RUN=true` and confirm the summary + (once live) the quote look right.
2. Set `DRY_RUN=false` in `.env`.
3. Restart. On detection it will send the buy and print the tx link.

## Config reference

See `.env.example` — every field is commented. Key ones:

| Field | Meaning |
|-------|---------|
| `TARGET_TOKENS` | one or more token addresses (comma-separated) |
| `BUY_AMOUNT_ETH` | ETH spent per buy |
| `SLIPPAGE_BPS` | slippage tolerance (500 = 5%) |
| `MAX_GAS_GWEI` | skip/wait if gas exceeds this |
| `DRY_RUN` | `true` simulates; `false` sends real buys |
| `UP_ROUTER` / `ROUTER_STYLE` | how buys are routed |
| `UP_V2_FACTORY` / `ROUTE_FACTORY` | instant detection + route factory |

## Optional features

- **Notifications:** set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` and/or
  `DISCORD_WEBHOOK` to get pinged on detection and on buy.
- **Multi-token:** put several addresses in `TARGET_TOKENS`.
- **Take-profit:** `TAKE_PROFIT_MULT` / `SELL_PCT` are scaffolded in config; the
  sell path (`swapExactTokensForETH` with an approval) is included in the ABIs —
  wire it to a price check once your pool/price source is known.

## Limitations / notes

- Robinhood Chain and up. are new; **verify every address** before going live.
- The bot can't tell a honeypot from a real token — the simulation only proves the
  *buy* would succeed, not that you can sell later.
- Untested against live Robinhood Chain in this repo; the dry-run + simulate guards
  are there so you validate safely before arming real buys.
