/**
 * Read-only checks against Orderly's live API and Robinhood Chain.
 * Usage: npm run live-check
 */
import { buildUniverse, type RawFutures, type RawInfo, type RawRwa } from "../src/lib/orderly/markets";

const API = "https://api.orderly.org";
const WS = "wss://ws-evm.orderly.org/ws/stream/OqdphuyCtYWxwzhxyLLjOWNdFP7sQt8RPWzmb5xY";
const RPC = "https://rpc.mainnet.chain.robinhood.com";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

let failures = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!cond) failures++;
};

async function rows<T>(path: string): Promise<T[]> {
  const j = (await (await fetch(API + path)).json()) as { success: boolean; data: { rows: T[] } };
  if (!j.success) throw new Error(path);
  return j.data.rows;
}

async function main() {
  const [info, futures, rwa, chains, tokens] = await Promise.all([
    rows<RawInfo>("/v1/public/info"),
    rows<RawFutures>("/v1/public/futures"),
    rows<RawRwa>("/v1/public/rwa/info"),
    rows<{ chain_id: string; name: string; vault_address: string }>("/v1/public/chain_info"),
    rows<{ token: string; chain_details: { chain_id: string; contract_address: string; decimals: number }[] }>("/v1/public/token"),
  ]);
  const u = buildUniverse(info, futures, rwa);
  ok("market list", u.markets.length > 50, `${u.markets.length} markets`);
  const slugs = new Set(u.markets.map((m) => m.slug.toLowerCase()));
  ok("slugs are unique", slugs.size === u.markets.length);
  const btc = u.markets.find((m) => m.slug === "BTC");
  ok("BTC market with live mark", !!btc && (btc.ctx?.markPx ?? 0) > 0, btc ? `mark ${btc.ctx?.markPx}` : "");
  const cats = u.markets.reduce<Record<string, number>>((a, m) => ((a[m.category] = (a[m.category] ?? 0) + 1), a), {});
  ok("stocks and indices present", (cats.stock ?? 0) > 0 && (cats.index ?? 0) > 0, JSON.stringify(cats));

  const rh = chains.find((c) => Number(c.chain_id) === 4663);
  ok("Robinhood Chain supported by Orderly", !!rh, rh ? `vault ${rh.vault_address}` : "");
  const usdg = tokens.find((t) => t.token === "USDG")?.chain_details.find((c) => Number(c.chain_id) === 4663);
  ok("USDG deposit token on Robinhood Chain", usdg?.contract_address.toLowerCase() === USDG, usdg ? `${usdg.contract_address} (${usdg.decimals} dp)` : "");

  const now = Math.floor(Date.now() / 1000);
  const tv = (await (await fetch(`${API}/tv/history?symbol=PERP_BTC_USDC&resolution=15&from=${now - 86400}&to=${now}`)).json()) as { s: string; c?: number[] };
  const last = tv.c?.at(-1) ?? 0;
  ok("candles", tv.s === "ok" && (tv.c?.length ?? 0) > 50, `${tv.c?.length} bars`);
  ok("candle close near mark", !!btc?.ctx && Math.abs(last / btc.ctx.markPx - 1) < 0.02, `close ${last} vs mark ${btc?.ctx?.markPx}`);

  const sys = (await (await fetch(`${API}/v1/public/system_info`)).json()) as { data: { status: number; msg: string } };
  ok("Orderly system status", sys.data.status === 0, sys.data.msg);

  const rpc = (await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) })).json()) as { result: string };
  ok("Robinhood Chain RPC", Number(rpc.result) === 4663, `chainId ${Number(rpc.result)}`);

  // websocket: orderbook + trade stream for BTC
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(WS);
    const got = new Set<string>();
    const done = () => { ws.close(); resolve(); };
    const timer = setTimeout(() => { ok("websocket streams", false, `got ${[...got].join(", ") || "nothing"}`); done(); }, 15_000);
    ws.onopen = () => {
      for (const topic of ["PERP_BTC_USDC@orderbook", "PERP_BTC_USDC@kline_1m", "markprices"]) ws.send(JSON.stringify({ id: topic, event: "subscribe", topic }));
    };
    ws.onmessage = (m) => {
      const j = JSON.parse(String(m.data));
      if (j.event === "ping") return ws.send(JSON.stringify({ event: "pong" }));
      if (j.topic) got.add(j.topic);
      if (got.size === 3) { clearTimeout(timer); ok("websocket streams", true, [...got].join(", ")); done(); }
    };
  });

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
