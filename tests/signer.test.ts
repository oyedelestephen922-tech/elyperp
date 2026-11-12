// Runs Lighter's official WASM signer (public/lighter) in Node and checks the
// transactions Elyperp asks it to sign. These field values were cross-checked
// against lighter-python's native signer for the same key and inputs.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";

type AnyFn = (...a: unknown[]) => unknown;
const g = globalThis as unknown as Record<string, AnyFn | undefined> & { Go: new () => { importObject: WebAssembly.Imports; run(i: WebAssembly.Instance): Promise<void> } };
const call = async (name: string, ...args: unknown[]) => {
  const first = await g[name]!(...args);
  return (typeof first === "function" ? await (first as AnyFn)() : first) as Record<string, string>;
};

const CHAIN = 466324;
const ACC = 22163;
const KEY = 7;

beforeAll(async () => {
  createRequire(import.meta.url)("../public/lighter/wasm_exec.js");
  const go = new g.Go();
  const { instance } = await WebAssembly.instantiate(readFileSync(new URL("../public/lighter/signer.wasm", import.meta.url)), go.importObject);
  void go.run(instance);
  const c = await call("_createClient", "11".repeat(32), CHAIN, ACC, 5, KEY);
  expect(c.prv).toHaveLength(80);
}, 30_000);

describe("lighter signer", () => {
  it("reports protocol 2", () => {
    expect((globalThis as { _signerVersion?: number })._signerVersion).toBe(2);
  });

  it("builds the register-key message the wallet signs", async () => {
    const c = await call("_createClient", "22".repeat(32), CHAIN, ACC, 0, KEY);
    expect(c.body).toContain("Register Lighter Account");
    expect(c.body).toContain(`api key index: 0x${KEY.toString(16).padStart(16, "0")}`);
  });

  it("signs a limit order with the fields Elyperp passes", async () => {
    await call("_selectClient", ACC, CHAIN, KEY);
    const r = await call("_signCreateOrder", ACC, 1, 12345, "100", "735479", 0, 0, 1, 0, "0", 1800000000000, 42);
    const tx = JSON.parse(r.txInfo);
    expect(tx).toMatchObject({ AccountIndex: ACC, ApiKeyIndex: KEY, MarketIndex: 1, ClientOrderIndex: 12345, BaseAmount: 100, Price: 735479, IsAsk: 0, Type: 0, TimeInForce: 1, OrderExpiry: 1800000000000, Nonce: 42, L2TxAttributes: null });
    expect(tx.Sig).toBeTruthy();
    expect(r.txHash).toMatch(/^[0-9a-f]{80}$/);
  });

  it("attaches integrator fields only when given", async () => {
    await call("_selectClient", ACC, CHAIN, KEY);
    const r = await call("_signCreateOrder", ACC, 1, 1, "100", "735479", 1, 1, 0, 1, "0", 0, 43, 18971, 250, 100);
    expect(JSON.parse(r.txInfo).L2TxAttributes).toEqual({ "1": 18971, "2": 250, "3": 100 });
  });

  it("signs grouped TP/SL, cancel, leverage and withdraw", async () => {
    await call("_selectClient", ACC, CHAIN, KEY);
    const grp = JSON.parse((await call("_signCreateGroupedOrders", ACC, 2, 2, 1, 0, "0", "800000", 1, 5, 1, 1, "790000", 1800000000000, 1, 0, "0", "600000", 1, 3, 1, 1, "610000", 1800000000000, 47)).txInfo);
    expect(grp.GroupingType).toBe(2);
    expect(grp.Orders).toHaveLength(2);
    expect(JSON.parse((await call("_signCancelOrder", ACC, 1, "844424714604996", 44)).txInfo)).toMatchObject({ MarketIndex: 1, Index: 844424714604996 });
    expect(JSON.parse((await call("_signUpdateLeverage", ACC, 1, 500, 1, 45)).txInfo)).toMatchObject({ InitialMarginFraction: 500, MarginMode: 1 });
    expect(JSON.parse((await call("_signWithdraw", ACC, 3, 0, "1500000", 46)).txInfo)).toMatchObject({ FromAccountIndex: ACC, AssetIndex: 3, RouteType: 0, Amount: 1500000 });
  });

  it("creates read-only auth tokens", async () => {
    await call("_selectClient", ACC, CHAIN, KEY);
    const r = await call("_createAuthToken", ACC, KEY);
    expect(r.token.split(":").slice(1, 3)).toEqual([String(ACC), String(KEY)]);
  });
});
