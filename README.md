# Elyperp

Perpetuals exchange front end on Robinhood Chain. Orders execute on Orderly Network's shared order book: crypto perps plus US stock, index, commodity and FX perps. Collateral is USDG deposited from Robinhood Chain.

Non-custodial. No backend secrets. Funds sit in Orderly's vault contract, and orders are signed in the browser and sent straight to Orderly.

## Stack

Next.js 15, TypeScript, Tailwind 4, wagmi 3 / viem, Orderly SDK (`@orderly.network/hooks`, `core`, `default-evm-adapter`), TradingView Lightweight Charts, zustand, vitest.

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
npm run live-check              # read-only checks against Orderly's live API and Robinhood Chain
npm run build && npm start
```

## Env

| Var | Default | |
|---|---|---|
| `NEXT_PUBLIC_ORDERLY_BROKER_ID` | empty | Builder ID from Orderly One. Without it the site shows live markets but accounts and trading stay off. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | empty | WalletConnect is off unless set |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | public Robinhood RPC | rate-limited; use a provider key for heavy traffic |

### Getting a builder ID

1. Go to https://dex.orderly.network and connect a wallet.
2. Create a builder profile and set the fee model.
3. Pay the one-time setup fee and register the admin account.
4. Put the ID in `NEXT_PUBLIC_ORDERLY_BROKER_ID` (Vercel: all environments) and redeploy.

## Network

| | |
|---|---|
| Chain | Robinhood Chain (Arbitrum Orbit L2 on Ethereum), chain ID `4663`, gas in ETH |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | `https://robinhoodchain.blockscout.com` |
| Collateral | USDG `0x5fc5360d0400a0fd4f2af552add042d716f1d168` (6 decimals) |
| Orderly vault on Robinhood Chain | `0x816f722424b49cf1275cc86da9840fbd5a6167e9` |
| Orderly API | `https://api.orderly.org`, WebSocket `wss://ws-evm.orderly.org` |

The chain ID, USDG address and vault come from Orderly's `/v1/public/chain_info` and `/v1/public/token`; `npm run live-check` re-verifies them.

## How it works

- **Markets.** `/api/markets` combines `/v1/public/info` (parameters), `/v1/public/futures` (prices, funding, OI) and `/v1/public/rwa/info` (trading sessions), cached briefly on the server. The client refreshes it every minute and streams `tickers` and `markprices` over WebSocket.
- **URLs.** `/trade/BTC`. A market listed by another builder on Orderly gets `-builder` on the end (`/trade/NVDA-mythos`) when Orderly also lists that ticker.
- **Charts.** History from Orderly's `/tv/history` (through `/api/candles`), live bar from the `SYMBOL@kline_*` stream.
- **Account.** The wagmi wallet is handed to Orderly's account object (`account.setAddress`), exactly like Orderly's own connector. Setup is two signatures: register the account under Elyperp's builder ID, then add an Ed25519 trading key that lives in the browser. The key can trade but not withdraw.
- **Orders.** `useOrderEntry` from Orderly's SDK: market, limit (GTC, IOC, FOK, post-only), reduce-only, TP/SL on entry, plus Orderly's own validation (min notional, ticks, price range, max size) and estimates (liquidation price, slippage, leverage).
- **Positions.** `usePositionStream`, close and partial close with `usePositionClose`, position TP/SL with `useTPSLOrder`, open orders and cancel with `useOrderStream`.
- **Funds.** `useDeposit` / `useWithdraw` for USDG on Robinhood Chain.

API routes: `/api/markets`, `/api/candles`, `/api/health`.

## Testing

- `npm test`: symbol parsing, slugs, categories, decimals, sessions and formatting against trimmed real API responses.
- `npm run live-check`: market list, Robinhood Chain support and USDG address on Orderly, candles vs mark, system status, Robinhood RPC, and the order book, kline and mark-price streams.

## Deploy (Vercel)

The repo is connected to the Vercel project, so pushing to `main` deploys. Set the env vars in the project and check `/api/health` afterwards.

## Known gaps

- Lightweight Charts only allows horizontal-line drawings; full drawing tools need TradingView's licensed Advanced Charts.
- Pre-trade liquidation price is an estimate. Open positions use Orderly's number.
- Deposits and withdrawals are USDG on Robinhood Chain only.
- Orderly's SDK is large, so the trade page's first load is around 830 KB of JavaScript.
- The rate limiter on the API routes is in-memory, so it's per instance.
