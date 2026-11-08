// Places/cancels real orders on Hyperliquid TESTNET with the app's order code.
// usage: TESTNET_PRIVATE_KEY=0x... npx tsx scripts/testnet-trade.ts [--with-fill]
// Use a throwaway testnet key only.
import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { discoverMarkets } from "../src/lib/hl/markets";
import { cancelOrder, closePosition, placeOrder } from "../src/lib/hl/trade";
import { roundPrice } from "../src/lib/hl/math";

const pk = process.env.TESTNET_PRIVATE_KEY as `0x${string}` | undefined;
if (!pk) throw new Error("Set TESTNET_PRIVATE_KEY (testnet throwaway key only)");
const transport = new HttpTransport({ isTestnet: true });
if (!transport.isTestnet) throw new Error("Refusing to run outside testnet");
const info = new InfoClient({ transport });
const wallet = privateKeyToAccount(pk);
const ex = new ExchangeClient({ transport, wallet });
const log = (...a: unknown[]) => console.log(...a);

(async () => {
  const st = await info.clearinghouseState({ user: wallet.address });
  log("account", wallet.address, "equity", st.marginSummary.accountValue);
  if (Number(st.marginSummary.accountValue) < 12) throw new Error("Fund the testnet account with at least ~$12 first");

  const { markets } = await discoverMarkets(info, { isTestnet: true });
  const m = markets.find((x) => x.coin === "ETH") ?? markets.find((x) => x.status === "active")!;
  const mark = m.ctx!.markPx;
  log("market", m.coin, "mark", mark, "asset", m.assetId);

  // 1. Resting limit 20% below mark, ~$11 notional
  const px = Number(roundPrice(mark * 0.8, m.szDecimals));
  const legs = await placeOrder(ex, { market: m, side: "long", type: "limit", tif: "Gtc", size: 11 / px, limitPx: px, refPx: mark, slippage: 0.01, reduceOnly: false });
  log("limit order →", legs);
  if (legs[0].state !== "open" || !legs[0].oid) throw new Error("Expected resting order");
  const open = await info.frontendOpenOrders({ user: wallet.address });
  log("visible in open orders:", open.some((o) => o.oid === legs[0].oid));

  // 2. Cancel
  await cancelOrder(ex, m.assetId, legs[0].oid);
  const after = await info.frontendOpenOrders({ user: wallet.address });
  log("cancelled:", !after.some((o) => o.oid === legs[0].oid));

  // 3. Rejection path — sub-$10 order must be REJECTED, not reported as success
  const bad = await placeOrder(ex, { market: m, side: "long", type: "limit", size: 1 / px, limitPx: px, refPx: mark, slippage: 0.01, reduceOnly: false });
  log("tiny order (should be rejected) →", bad[0].state, bad[0].error);

  if (process.argv.includes("--with-fill")) {
    const fill = await placeOrder(ex, { market: m, side: "long", type: "market", size: 11 / mark, refPx: mark, slippage: 0.02, reduceOnly: false, slPx: Number(roundPrice(mark * 0.7, m.szDecimals)) });
    log("market long + SL →", fill);
    const pos = (await info.clearinghouseState({ user: wallet.address })).assetPositions.find((p) => p.position.coin === m.coin);
    log("position:", pos?.position.szi, "liq", pos?.position.liquidationPx);
    if (pos) log("close →", await closePosition(ex, { market: m, szi: Number(pos.position.szi), fraction: 1, type: "market", refPx: mark, slippage: 0.02 }));
  }
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
