# Elyperp

Perps exchange frontend for the Robinhood Chain ecosystem. Orders execute on Hyperliquid (HyperCore): crypto perps plus stock, index, commodity and FX perps from HIP-3 builder dexes.

Non-custodial. No backend secrets. Orders are signed in the browser and sent straight to Hyperliquid.

## Stack

Next.js 15, TypeScript, Tailwind 4, wagmi 3 / viem, [@nktkas/hyperliquid](https://github.com/nktkas/hyperliquid), TradingView Lightweight Charts, zustand, vitest.

## Setup

Needs Node 22.12+.

```bash
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
npm run dev                     # http://localhost:3000
```

Other scripts:

```bash
npm test                        # unit tests
npm run live-check testnet      # read-only check against the live API (or mainnet)
npm run build && npm start
```

## Env

| Var | Default | |
|---|---|---|
| `NEXT_PUBLIC_HL_NETWORK` | `testnet` | `testnet` or `mainnet` |
| `NEXT_PUBLIC_ROBINHOOD_CHAIN_ID` | follows HL network | `4663` mainnet, `46630` testnet |
| `NEXT_PUBLIC_ROBINHOOD_CHAIN_NAME` | `Robinhood Chain` / `Robinhood Chain Testnet` | |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | public Robinhood RPC | rate-limited; use a provider key for heavy traffic |
| `NEXT_PUBLIC_ROBINHOOD_EXPLORER_URL` | Blockscout | |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | empty | WalletConnect is off unless set |
| `TESTNET_PRIVATE_KEY` | | only for `scripts/testnet-trade.ts` |

Robinhood Chain is Robinhood's Arbitrum Orbit L2 on Ethereum (gas in ETH). With `NEXT_PUBLIC_HL_NETWORK=mainnet` the app uses Robinhood Chain mainnet (4663); on testnet it uses Robinhood Chain Testnet (46630).

## How it works

- **Markets.** `perpDexs`, `allPerpMetas`, `perpCategories`, `spotMeta`, plus one `allDexsAssetCtxs` websocket snapshot. That's a fixed number of calls no matter how many dexes exist (testnet has ~280). The list refreshes every 5 min, so new listings show up on their own. HIP-3 asset id = `100000 + dexIndex * 10000 + index`.
- **Prices.** The all-dex stream pushes every ~12s; the market you're on also uses `activeAssetCtx` (~1s). If nothing arrives for 30s, prices are marked stale.
- **Account.** `allDexsClearinghouseState`, `orderUpdates` and `userFills` over websocket, with http polling as a fallback.
- **Signing.** The wallet signs `approveAgent` once for a key generated in the browser. That key signs orders and can't withdraw. No seed phrase or private key is ever asked for.
- **Orders.** Market (IOC with a slippage cap), limit (GTC/IOC/ALO), reduce-only, TP/SL on entry or on an open position, full or partial close, cancel, leverage, and cross/isolated. Each leg shows the exchange's actual status, so a rejected order never shows as filled.
- **Checks before sending.** Lot and tick rounding, $10 minimum, leverage cap, max size from `activeAssetData`, TP/SL direction, inactive markets, and a lock against double submits.

API routes: `/api/markets` (discovery; serves the last result instantly and refreshes in the background), `/api/candles`, `/api/health`.

## Wallet / Robinhood Chain

Add Robinhood Chain to MetaMask or Rabby (chain 4663, ETH, `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robinhoodchain.blockscout.com`). Testnet is chain 46630 with `https://rpc.testnet.chain.robinhood.com`. The app also offers to switch or add it. Your EVM address is your Hyperliquid account.

## Funding the account

Connecting a wallet doesn't move any money. Ways to get USDC onto HyperCore:

- Arbitrum USDC through the Hyperliquid bridge (min 5 USDC)
- HyperEVM USDC through Circle's `CoreDepositWallet.deposit(amount, 0)`
- Robinhood Chain → Arbitrum with a route Robinhood lists (Across, Relay, LI.FI/Jumper; see https://docs.robinhood.com/chain/bridging/), then the Arbitrum route above

There's no direct Robinhood Chain → HyperCore deposit, so it isn't wired in. If one is published, add it in `OnboardingModal.tsx`.

The setup dialog also handles moving spot USDC to perps, approving the trading key, and turning on HIP-3 dex abstraction.

## Testing

- `npm test`: discovery against stubbed API responses, rounding, liquidation math, order validation, status mapping, and agent signature recovery.
- `npm run live-check mainnet|testnet`: discovery, asset ids, candles vs mark, book, websocket streams, and checks that a bad signature is rejected. Last run (Nov 8 2026): mainnet 560 markets / 11 dexes, testnet 1007 / 278, all passing.
- `TESTNET_PRIVATE_KEY=0x... npx tsx scripts/testnet-trade.ts --with-fill`: resting order, cancel, a too-small order getting rejected, then opening and closing a position. Testnet funds: https://app.hyperliquid-testnet.xyz/drip

## Deploy (Vercel)

```bash
npx vercel link
npx vercel --prod
```

Set the env vars in the Vercel project. The install command is `npm install` (`.npmrc` already sets `legacy-peer-deps`). Check `/api/health` after deploying.

## Known gaps

- Lightweight Charts only allows horizontal-line drawings; full drawing tools need TradingView's licensed Advanced Charts.
- Pre-trade liquidation price is an estimate. Open positions use Hyperliquid's number.
- The US session indicator ignores exchange holidays.
- HIP-3 dexes with non-USDC collateral (USDH, USDE, etc.) need that token in the account.
- The rate limiter on the API routes is in-memory, so it's per instance. Use Redis/Upstash if you need a global limit.
