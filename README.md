# Elyperp

Perpetuals exchange front end on Robinhood Chain. Orders execute on Lighter's Robinhood Chain exchange: crypto perps plus US stock, ETF, gold/silver and pre-IPO perps. Collateral is USDG deposited on Robinhood Chain.

Non-custodial. No backend secrets and no venue sign-up fee. Funds sit in Lighter's contract on Robinhood Chain, and orders are signed in the browser with Lighter's own signer and sent straight to Lighter.

## Stack

Next.js 15, TypeScript, Tailwind 4, wagmi 3 / viem, Lighter's browser signer (WASM, from `lighter-go/web-wasm`), TradingView Lightweight Charts, zustand, vitest.

## Setup

Needs Node 22.12+.

```bash
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
npm run dev                     # http://localhost:3000
```

Other scripts:

```bash
npm test                        # unit tests, including Lighter's WASM signer
npm run live-check              # read-only checks against Lighter's live API and Robinhood Chain
npm run build && npm start
```

## Env

Nothing is required. Trading works with an empty env.

| Var | Default | |
|---|---|---|
| `NEXT_PUBLIC_LIGHTER_INTEGRATOR_INDEX` | empty | Lighter account index that collects Elyperp's builder fee. Empty = no fee. |
| `NEXT_PUBLIC_LIGHTER_INTEGRATOR_TAKER_FEE` | empty | Builder taker fee in Lighter fee units (1,000,000 = 100%, so 25 = 0.0025%). |
| `NEXT_PUBLIC_LIGHTER_INTEGRATOR_MAKER_FEE` | empty | Builder maker fee, same units. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | empty | WalletConnect is off unless set |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | public Robinhood RPC | rate-limited; use a provider key for heavy traffic |

### Builder fee

Lighter only lets a partner fee apply to accounts on the Plus or Premium tiers, and only after the trader approves it (one wallet signature, offered in Account setup). Standard accounts trade fee-free and Elyperp sends their orders without any partner fields. To collect fees: open a Lighter account on Robinhood Chain (deposit at https://robinhoodchain.lighter.xyz), put its account index and the fees in the env vars above, and redeploy. If Lighter ever rejects the fee on an order, Elyperp re-sends that order without it.

## Network

| | |
|---|---|
| Robinhood Chain | chain ID `4663`, gas in ETH, RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robinhoodchain.blockscout.com` |
| USDG | `0x5fc5360d0400a0fd4f2af552add042d716f1d168`, 6 decimals, Lighter asset id 3 |
| Lighter contract on Robinhood Chain | `0x94bAB9693Ba2f6358507eFfcbd372b0660AFfF9d` |
| Lighter API | `https://api.rh.lighter.xyz`, WebSocket `wss://api.rh.lighter.xyz/stream`, signing chain id `466324` |

`npm run live-check` re-verifies the contract address against Lighter's `/info` and the USDG decimals on chain.

## How it works

- **Markets.** `/api/v1/orderBookDetails` (every minute) plus the `market_stats/all` WebSocket channel for live prices, funding, volume and open interest. URLs are `/trade/BTC`.
- **Order book and trades.** `order_book/{id}` (snapshot, then deltas) and `trade/{id}` channels over one shared WebSocket.
- **Charts.** History from `/api/v1/candles`, live bar built from the trade stream.
- **Account.** The wallet's Lighter account comes from `/api/v1/accountsByL1Address`; the first USDG deposit (`deposit(to, 3, 0, amount)` on Lighter's contract) creates it. "Enable trading" makes an API key in the browser with Lighter's signer, the wallet signs Lighter's "Register Lighter Account" message, and the key is stored in local storage. It signs orders, cancels, leverage changes and withdrawals (which always pay out to the owner's address).
- **Orders.** Market (IOC at a worst price from the chosen slippage), limit (GTC up to 28 days, IOC, post-only), reduce-only, TP/SL attached to an entry (grouped OTO/OTOCO), TP/SL on a position (OCO tied to the position), close and partial close, cancel.
- **Region rules.** Lighter rejects orders from restricted regions (including the US and UK) by the caller's IP. Every transaction is sent from the user's browser, never through Elyperp's server, so Lighter sees the trader's own location.

API route: `/api/health`.

## Testing

- `npm test`: market parsing, categories, integer scaling, order building (market/limit/TIF/TP/SL), positions and formatting against trimmed real API responses, plus the WASM signer run in Node (field-for-field match with lighter-python's native signer).
- `npm run live-check`: API status, contract address, market list, candles, account lookup, WebSocket snapshots, Robinhood RPC and USDG decimals.

## Deploy (Vercel)

The repo is connected to the Vercel project, so pushing to `main` deploys. Check `/api/health` afterwards.

## Known gaps

- Lightweight Charts only allows horizontal-line drawings; full drawing tools need TradingView's licensed Advanced Charts.
- No pre-trade liquidation estimate. Open positions show Lighter's own liquidation price.
- Deposits and withdrawals are USDG on Robinhood Chain only.
- The signer is a 7.7 MB WASM file (compressed in transit). It only downloads for wallets that enable trading.
