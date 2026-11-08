import { describe, expect, it } from "vitest";
import { ExchangeClient } from "@nktkas/hyperliquid";
import { createL1ActionHash } from "@nktkas/hyperliquid/signing";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";

describe("agent signing", () => {
  it("signs an order action recoverable to the agent address", async () => {
    const agent = privateKeyToAccount(generatePrivateKey());
    let captured: { action: Record<string, unknown>; nonce: number; signature: { r: `0x${string}`; s: `0x${string}`; v: number } } | null = null;
    const transport = {
      isTestnet: true,
      request: async (_ep: string, payload: unknown) => {
        captured = payload as typeof captured;
        return { status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } } };
      },
    };
    const ex = new ExchangeClient({ transport: transport as never, wallet: agent });
    const res = await ex.order({
      orders: [{ a: 110000, b: true, p: "100", s: "1", r: false, t: { limit: { tif: "Gtc" } } }],
      grouping: "na",
    });
    expect(res.response.data.statuses[0]).toEqual({ resting: { oid: 1 } });
    expect(captured).not.toBeNull();
    const c = captured!;
    const connectionId = createL1ActionHash({ action: c.action, nonce: c.nonce });
    const recovered = await recoverTypedDataAddress({
      domain: { name: "Exchange", version: "1", chainId: 1337, verifyingContract: "0x0000000000000000000000000000000000000000" },
      types: { Agent: [{ name: "source", type: "string" }, { name: "connectionId", type: "bytes32" }] },
      primaryType: "Agent",
      message: { source: "b", connectionId }, // "b" = testnet
      signature: { r: c.signature.r, s: c.signature.s, v: BigInt(c.signature.v) },
    });
    expect(recovered.toLowerCase()).toBe(agent.address.toLowerCase());
  });
});
