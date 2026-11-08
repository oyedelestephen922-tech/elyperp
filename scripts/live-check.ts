// Hits the live Hyperliquid API (read-only, no wallet).
// usage: npx tsx scripts/live-check.ts [mainnet|testnet]
import { HttpTransport, InfoClient, SubscriptionClient, WebSocketTransport } from "@nktkas/hyperliquid";
import { discoverMarkets } from "../src/lib/hl/markets";


const net = process.argv[2] === "testnet" ? "testnet" : "mainnet";
const isTestnet = net === "testnet";
const info = new InfoClient({ transport: new HttpTransport({ isTestnet, timeout: 20_000 }) });

function ok(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  console.log(`\n=== Hyperliquid ${net} ===`);
  const t0 = Date.now();
  const u = await discoverMarkets(info, { isTestnet });
  ok("market discovery", u.markets.length > 0, `${u.markets.length} markets, ${u.dexes.length} dexes in ${Date.now() - t0}ms`);
  if (u.errors.length) console.log("  discovery warnings:", u.errors);
  const by = (c: string) => u.markets.filter((m) => m.category === c);
  for (const c of ["crypto", "stock", "index", "commodity", "fx", "other"])
    console.log(`  ${c.padEnd(9)} ${String(by(c).length).padStart(4)}  e.g. ${by(c).slice(0, 8).map((m) => m.coin).join(", ")}`);
  console.log("  dexes:", u.dexes.map((d) => `${d.name || "(hl)"}[${d.collateral}, ${d.marketCount}]`).join(" "));

  for (const sym of ["BTC", "ETH", "SOL", "HYPE"]) {
    const m = u.markets.find((x) => x.coin === sym);
    ok(`${sym} listed with live ctx`, !!m?.ctx && m.ctx.markPx > 0, m ? `mark ${m.ctx?.markPx} maxLev ${m.maxLeverage} szDec ${m.szDecimals} asset ${m.assetId}` : "missing");
  }
  const hip3 = u.markets.filter((m) => m.dex && m.status === "active").sort((a, b) => (b.ctx?.dayNtlVlm ?? 0) - (a.ctx?.dayNtlVlm ?? 0));
  ok("HIP-3 markets discovered", hip3.length > 0, hip3.slice(0, 6).map((m) => `${m.coin}=${m.ctx?.markPx} (#${m.assetId}, ${m.marginMode})`).join(", "));

  // Asset-id sanity: re-query meta for one HIP-3 dex and confirm index alignment
  if (hip3[0]) {
    const meta = await info.meta({ dex: hip3[0].dex });
    const idx = meta.universe.findIndex((x) => x.name === hip3[0].coin);
    ok("HIP-3 asset id formula", hip3[0].assetId === 100000 + hip3[0].dexIndex * 10000 + idx, `${hip3[0].coin} → ${hip3[0].assetId}`);
  }

  const btc = u.markets.find((m) => m.coin === "BTC")!;
  const candles = await info.candleSnapshot({ coin: "BTC", interval: "15m", startTime: Date.now() - 6 * 3600_000 });
  ok("BTC 15m candles", candles.length > 10, `${candles.length} candles, last close ${candles.at(-1)?.c}`);
  const drift = Math.abs(Number(candles.at(-1)!.c) - btc.ctx!.markPx) / btc.ctx!.markPx;
  ok("chart price matches market mark (<1%)", drift < 0.01, `${(drift * 100).toFixed(3)}%`);
  if (hip3[0]) {
    const hc = await info.candleSnapshot({ coin: hip3[0].coin, interval: "1h", startTime: Date.now() - 48 * 3600_000 });
    ok(`HIP-3 candles (${hip3[0].coin})`, hc.length > 0, `${hc.length} candles`);
  }
  const book = await info.l2Book({ coin: "BTC" });
  ok("BTC L2 book", !!book && book.levels[0].length > 0 && book.levels[1].length > 0, `best bid ${book?.levels[0][0]?.px} / ask ${book?.levels[1][0]?.px}`);
  const cats = await info.perpCategories().catch(() => []);
  console.log(`  perpCategories: ${cats.length} entries; sample ${JSON.stringify(cats.slice(0, 5))}; distinct ${JSON.stringify([...new Set(cats.map((c) => c[1]))])}`);

  // WebSocket: all-dex asset contexts, l2Book and trades must stream within 15s
  const ws = new WebSocketTransport({ isTestnet });
  const subs = new SubscriptionClient({ transport: ws });
  const got = { ctx: 0, book: 0, trades: 0, dexesInCtx: 0 };
  const s1 = await subs.allDexsAssetCtxs((e) => { got.ctx++; got.dexesInCtx = e.ctxs.length; });
  const s2 = await subs.l2Book({ coin: "BTC" }, () => got.book++);
  const s3 = await subs.trades({ coin: "BTC" }, () => got.trades++);
  await new Promise((r) => setTimeout(r, 15_000));
  ok("WS allDexsAssetCtxs streaming", got.ctx > 0, `${got.ctx} updates covering ${got.dexesInCtx} dexes`);
  ok("WS l2Book streaming", got.book > 0, `${got.book} updates`);
  ok("WS trades streaming", got.trades > 0 || isTestnet, `${got.trades} updates`);
  await Promise.all([s1.unsubscribe(), s2.unsubscribe(), s3.unsubscribe()]);
  ws.close();

  // Exchange endpoint reachability: an unsigned/invalid request must be REJECTED, never "ok".
  const res = await fetch(`https://api.hyperliquid${isTestnet ? "-testnet" : ""}.xyz/exchange`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: { type: "cancel", cancels: [{ a: 0, o: 1 }] }, nonce: Date.now(), signature: { r: "0x" + "1".repeat(64), s: "0x" + "1".repeat(64), v: 27 } }),
  });
  const body = await res.text();
  ok("exchange rejects bogus signature (no fake success)", !body.includes('"status":"ok"') || body.includes("error"), body.slice(0, 160));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
