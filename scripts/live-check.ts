/**
 * Read-only checks against Lighter's Robinhood Chain API and Robinhood Chain itself.
 * Usage: npm run live-check
 * Run it from a region Lighter serves (sendTx is never called here).
 */
import { buildUniverse, type RawDetail } from "../src/lib/lighter/markets";
import { COLLATERAL, LIGHTER, robinhood } from "../src/lib/config";

let failures = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!cond) failures++;
};

async function get<T>(path: string): Promise<T> {
  const r = await fetch(LIGHTER.apiUrl + path);
  return (await r.json()) as T;
}

async function rpc(method: string, params: unknown[]) {
  const r = await fetch(robinhood.rpcUrls.default.http[0], {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return ((await r.json()) as { result: string }).result;
}

async function main() {
  const status = await get<{ status: number }>("/");
  ok("API up", status.status === 200);
  const info = await get<{ contract_address: string }>("/info");
  ok("deposit contract matches config", info.contract_address.toLowerCase() === LIGHTER.contract.toLowerCase(), info.contract_address);

  const d = await get<{ code: number; order_book_details: RawDetail[] }>("/api/v1/orderBookDetails");
  const u = buildUniverse(d.order_book_details ?? []);
  ok("market list", u.markets.length > 30, `${u.markets.length} perps`);
  ok("slugs are unique", new Set(u.markets.map((m) => m.slug.toLowerCase())).size === u.markets.length);
  const btc = u.markets.find((m) => m.symbol === "BTC");
  ok("BTC market with mark price", !!btc && (btc.ctx?.markPx ?? 0) > 0, btc ? `id ${btc.id}, mark ${btc.ctx?.markPx}, ${btc.maxLeverage}x` : "");
  const cats = u.markets.reduce<Record<string, number>>((a, m) => ((a[m.category] = (a[m.category] ?? 0) + 1), a), {});
  ok("stocks present", (cats.stock ?? 0) > 0, JSON.stringify(cats));
  ok("every price fits the signer's uint32", u.markets.every((m) => (m.ctx?.markPx ?? 0) * 10 ** m.pxDecimals * 2 < 2 ** 32));

  if (btc) {
    const now = Date.now();
    const c = await get<{ code: number; c: unknown[] }>(`/api/v1/candles?market_id=${btc.id}&resolution=1h&start_timestamp=${now - 50 * 3600_000}&end_timestamp=${now}&count_back=50`);
    ok("candles", c.code === 200 && c.c.length > 10, `${c.c.length} bars`);
    const nonce = await get<{ code: number; nonce: number }>("/api/v1/nextNonce?account_index=1&api_key_index=4");
    ok("nextNonce endpoint", nonce.code === 200 || typeof nonce.nonce === "number");
  }

  const nf = await get<{ code: number }>("/api/v1/accountsByL1Address?l1_address=0x0000000000000000000000000000000000000001");
  ok("unknown wallet reads as 'no account'", nf.code === 21100);

  // WebSocket: snapshot + market stats
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(LIGHTER.wsUrl);
    const seen = new Set<string>();
    const done = () => {
      ok("ws order book snapshot", seen.has("subscribed/order_book"));
      ok("ws market stats", seen.has("subscribed/market_stats"));
      ws.close();
      resolve();
    };
    const t = setTimeout(done, 8000);
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as { type: string };
      if (m.type === "connected") {
        ws.send(JSON.stringify({ type: "subscribe", channel: `order_book/${btc?.id ?? 1}` }));
        ws.send(JSON.stringify({ type: "subscribe", channel: "market_stats/all" }));
      }
      if (m.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
      seen.add(m.type);
      if (seen.has("subscribed/order_book") && seen.has("subscribed/market_stats")) {
        clearTimeout(t);
        done();
      }
    };
  });

  const chain = await rpc("eth_chainId", []);
  ok("Robinhood Chain RPC", Number(chain) === robinhood.id, String(Number(chain)));
  const dec = await rpc("eth_call", [{ to: COLLATERAL.address, data: "0x313ce567" }, "latest"]);
  ok("USDG decimals", Number(dec) === COLLATERAL.decimals, String(Number(dec)));

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
