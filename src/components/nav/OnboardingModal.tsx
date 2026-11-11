"use client";
import clsx from "clsx";
import { ExchangeClient } from "@nktkas/hyperliquid";
import { useEffect, useState, type ReactNode } from "react";
import { useChainId, useConnection, useSwitchChain, useWalletClient } from "wagmi";
import { Button, Modal, Spinner } from "@/components/ui/primitives";
import { useTrading } from "@/components/providers/TradingProvider";
import { robinhood, IS_TESTNET, LINKS } from "@/lib/config";
import { fmtUsd } from "@/lib/format";
import { getHttpTransport, getInfo } from "@/lib/hl/clients";
import { humanizeError, logError } from "@/lib/hl/errors";
import { selectSummary, useAccountStore } from "@/store/account";
import { useToasts } from "@/store/toasts";

export function OnboardingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { address } = useConnection();
  const chainId = useChainId();
  const { mutate: switchChain, isPending: switching } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { status, enableTrading, error, exchange } = useTrading();
  const states = useAccountStore((s) => s.states);
  const spot = useAccountStore((s) => s.spot);
  const loaded = useAccountStore((s) => s.loaded);
  const push = useToasts((s) => s.push);
  const [abstraction, setAbstraction] = useState<{ mode: string; dex: boolean | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const equity = selectSummary(states).equity;
  const spotUsdc = Number(spot?.balances.find((b) => b.coin === "USDC")?.total ?? 0);
  const onRobinhood = chainId === robinhood.id;
  const funded = equity > 0 || spotUsdc > 0;

  useEffect(() => {
    if (!open || !address) return;
    Promise.all([
      getInfo().userAbstraction({ user: address }).catch(() => "unknown"),
      getInfo().userDexAbstraction({ user: address }).catch(() => null),
    ]).then(([mode, dex]) => setAbstraction({ mode: String(mode), dex }));
  }, [open, address, status]);

  const moveSpotToPerp = async () => {
    if (!walletClient || spotUsdc <= 0) return;
    setBusy("transfer");
    const id = push({ title: `Move ${spotUsdc.toFixed(2)} USDC spot → perps`, state: "pending", detail: "Confirm in your wallet" });
    try {
      const ex = new ExchangeClient({ transport: getHttpTransport(), wallet: walletClient as never });
      await ex.usdClassTransfer({ amount: String(Math.floor(spotUsdc * 1e6) / 1e6), toPerp: true });
      useToasts.getState().update(id, { state: "success", detail: "Transferred to perps balance" });
    } catch (e) {
      logError("usdClassTransfer", e);
      useToasts.getState().update(id, { state: "error", detail: humanizeError(e) });
    } finally {
      setBusy(null);
    }
  };

  const enableDexAbstraction = async () => {
    if (!exchange) return;
    setBusy("dex");
    try {
      await exchange.agentEnableDexAbstraction();
      setAbstraction((a) => (a ? { ...a, dex: true } : a));
      push({ title: "HIP-3 dex abstraction enabled", state: "success" });
    } catch (e) {
      logError("agentEnableDexAbstraction", e);
      push({ title: "Could not enable dex abstraction", state: "error", detail: humanizeError(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Account setup & collateral" width="max-w-xl">
      <ol className="flex flex-col gap-3 text-xs">
        <Step n={1} done={!!address} title="Wallet connected">
          <span className="num text-muted break-all">{address}</span>
        </Step>

        <Step n={2} done={onRobinhood} title={`${robinhood.name} (chain ${robinhood.id})`}>
          {onRobinhood ? (
            <p className="text-muted">Connected to {robinhood.name}. Your same address is used as your Hyperliquid account.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-warn">Your wallet is on chain {chainId}. Switch to {robinhood.name} to use the ecosystem network.</p>
              <Button onClick={() => switchChain({ chainId: robinhood.id })} disabled={switching} className="self-start">
                {switching ? "Switching…" : `Switch to ${robinhood.name}`}
              </Button>
              <p className="text-faint">Trading signatures work on any chain. The network only matters for Robinhood Chain balances and bridging.</p>
            </div>
          )}
        </Step>

        <Step n={3} done={funded} title="Fund your Hyperliquid account">
          <div className="flex flex-col gap-2 text-muted">
            <div className="grid grid-cols-2 gap-2">
              <Box label="Perps equity">{loaded ? fmtUsd(equity) : <Spinner />}</Box>
              <Box label="Spot USDC">{spot ? fmtUsd(spotUsdc) : <Spinner />}</Box>
            </div>
            {spotUsdc > 0 && abstraction?.mode !== "unifiedAccount" && (
              <Button onClick={moveSpotToPerp} disabled={busy === "transfer"} className="self-start">
                {busy === "transfer" ? "Confirm in wallet…" : "Move spot USDC to perps"}
              </Button>
            )}
            <p>Connecting a wallet does not create or fund a Hyperliquid account. Collateral must arrive on HyperCore via a supported route:</p>
            <Route title="Arbitrum USDC → Hyperliquid (official bridge)" href={LINKS.hyperliquidDeposit}>
              Deposit native USDC from Arbitrum in the Hyperliquid app. Minimum 5 USDC. Smaller deposits are lost.
            </Route>
            <Route title="HyperEVM USDC → HyperCore (Circle CoreDepositWallet)" href={LINKS.circleHyperEvmToCore}>
              Approve USDC, then call <code>deposit(amount, 0)</code> to credit your perps balance.
            </Route>
            <Route title="From Robinhood Chain" href={LINKS.robinhoodBridging}>
              Bridge USDC from Robinhood Chain to Arbitrum with one of the routes Robinhood lists (Across, Relay, LI.FI/Jumper),
              then deposit it to Hyperliquid with the Arbitrum route above.
            </Route>
            {IS_TESTNET && (
              <Route title="Testnet faucet" href={LINKS.testnetFaucet}>
                Claim testnet USDC (Hyperliquid requires the address to have a mainnet deposit history).
              </Route>
            )}
          </div>
        </Step>

        <Step n={4} done={status === "ready"} title="Enable trading">
          <div className="flex flex-col gap-2 text-muted">
            <p>
              Sign one message to approve a browser-generated trading key. It can place and cancel orders on your account but
              <b className="text-fg"> cannot withdraw or transfer funds</b>. It stays on this device; you can revoke it anytime.
            </p>
            {status === "ready" ? (
              <span className="text-accent">Trading enabled on this device.</span>
            ) : (
              <Button variant="accent" onClick={enableTrading} disabled={!address || status === "approving" || status === "checking"} className="self-start">
                {status === "approving" ? "Confirm in wallet…" : status === "checking" ? "Checking…" : "Enable trading"}
              </Button>
            )}
            {error && <p className="text-short">{error}</p>}
          </div>
        </Step>

        <Step n={5} done={abstraction?.dex === true || abstraction?.mode === "unifiedAccount"} title="HIP-3 markets (stocks & indices)" optional>
          <div className="flex flex-col gap-2 text-muted">
            <p>
              Stock and index perps live on builder-deployed (HIP-3) dexes, each with its own collateral. Dex abstraction lets USDC-collateral
              dexes use your main perps balance automatically. Account mode: <span className="text-fg">{abstraction?.mode ?? "…"}</span>.
            </p>
            {abstraction?.dex !== true && abstraction?.mode !== "unifiedAccount" && (
              <Button onClick={enableDexAbstraction} disabled={status !== "ready" || busy === "dex"} className="self-start">
                {busy === "dex" ? "Enabling…" : "Enable dex abstraction"}
              </Button>
            )}
            <p className="text-faint">Dexes using another collateral token (e.g. USDH) need that token in your account.</p>
          </div>
        </Step>
      </ol>
    </Modal>
  );
}

function Step({ n, done, title, children, optional }: { n: number; done: boolean; title: string; children: ReactNode; optional?: boolean }) {
  return (
    <li className="flex gap-3">
      <span className={clsx("mt-0.5 h-5 w-5 shrink-0 rounded-full grid place-items-center text-[10px] font-semibold",
        done ? "bg-accent text-black" : "border border-line-2 text-muted")}>{done ? "✓" : n}</span>
      <div className="flex-1 min-w-0">
        <div className="text-fg font-medium mb-1">{title}{optional && <span className="text-faint font-normal"> · optional</span>}</div>
        {children}
      </div>
    </li>
  );
}

function Box({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded border border-line bg-panel px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className="num text-fg text-sm">{children}</div>
    </div>
  );
}

function Route({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="block rounded border border-line bg-panel px-3 py-2 hover:border-accent/40">
      <div className="text-fg">{title} ↗</div>
      <div className="text-muted mt-0.5">{children}</div>
    </a>
  );
}
