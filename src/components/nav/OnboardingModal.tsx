"use client";
import clsx from "clsx";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import { useChainId, useConnection, useSwitchChain } from "wagmi";
import { Button, Modal, Spinner, Tabs } from "@/components/ui/primitives";
import { COLLATERAL, INTEGRATOR, LINKS, robinhood } from "@/lib/config";
import { fmtUsd } from "@/lib/format";
import { humanizeError, logError } from "@/lib/errors";
import { useAccountStage, useSession } from "@/lib/lighter/session";
import { accountSummary } from "@/lib/lighter/positions";
import {
  approveIntegrator, approveUsdg, canApproveIntegrator, depositUsdg, integratorFor, readUsdg, setupTradingKey, withdrawUsdg,
} from "@/lib/lighter/actions";
import { useToasts } from "@/store/toasts";

export function OnboardingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { stage, accountIndex } = useAccountStage();
  const { address } = useConnection();
  const chainId = useChainId();
  const onRobinhood = chainId === robinhood.id;
  const { mutate: switchChain, isPending: switching } = useSwitchChain();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keyStatus = useSession((s) => s.keyStatus);
  // re-render when the tier or approvals change, so the builder-fee option shows correctly
  useSession((s) => s.tier);
  useSession((s) => s.account?.approved_integrators);
  const hasAccount = accountIndex != null;

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      await setupTradingKey(setStep);
      useToasts.getState().push({ title: "Trading enabled in this browser", state: "success" });
    } catch (e) {
      logError("setupTradingKey", e);
      setError(humanizeError(e));
    } finally {
      setBusy(false);
      setStep(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Account setup & funds" width="max-w-xl">
      <ol className="flex flex-col gap-3 text-xs">
        <Step n={1} done={!!address} title="Wallet connected">
          <span className="num text-muted break-all">{address}</span>
        </Step>

        <Step n={2} done={onRobinhood} title={`${robinhood.name} (chain ${robinhood.id})`}>
          {onRobinhood ? (
            <p className="text-muted">Connected to {robinhood.name}. Deposits and withdrawals use this network.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-warn">Your wallet is on chain {chainId}. Switch to {robinhood.name} to move funds.</p>
              <Button onClick={() => switchChain({ chainId: robinhood.id })} disabled={switching} className="self-start">
                {switching ? "Switching…" : `Switch to ${robinhood.name}`}
              </Button>
            </div>
          )}
        </Step>

        <Step n={3} done={hasAccount} title={hasAccount ? `Lighter account #${accountIndex}` : `Deposit ${COLLATERAL.symbol} to open your Lighter account`}>
          {stage === "checking" && !hasAccount ? (
            <span className="flex items-center gap-2 text-muted"><Spinner /> Looking up your Lighter account…</span>
          ) : hasAccount ? (
            <p className="text-muted">Found. Your collateral sits in Lighter&apos;s contract on {robinhood.name}, not with Elyperp.</p>
          ) : (
            <div className="flex flex-col gap-2 text-muted">
              <p>Your first deposit creates your Lighter account. It shows up here a minute or two after the deposit confirms.</p>
              {onRobinhood ? <Deposit /> : <p className="text-warn">Switch to {robinhood.name} first.</p>}
            </div>
          )}
        </Step>

        <Step n={4} done={stage === "ready"} title="Enable trading in this browser">
          <div className="flex flex-col gap-2 text-muted">
            <p>
              Sign one message to register a trading key for this browser. The key signs orders without more wallet pop-ups.
              It can withdraw only to your own wallet address, and you can forget it from the wallet menu.
            </p>
            <p className="text-faint">
              By enabling trading you agree to the <a href="/legal/terms" target="_blank" className="text-accent">Terms of Use</a> and
              confirm you&apos;ve read the <a href="/legal/risk" target="_blank" className="text-accent">Risk Disclosure</a>.
            </p>
            {keyStatus === "invalid" && <p className="text-warn">The key saved in this browser is no longer registered with Lighter. Enable trading again.</p>}
            {stage === "ready" ? (
              <span className="text-accent">Trading enabled in this browser.</span>
            ) : (
              <Button variant="accent" onClick={enable} disabled={!hasAccount || busy} className="self-start">
                {busy ? (step ?? "Working…") : "Enable trading"}
              </Button>
            )}
          </div>
        </Step>

        {stage === "ready" && (
          <Step n={5} done={false} title="Funds">
            <Funds onRobinhood={onRobinhood} />
          </Step>
        )}

        {stage === "ready" && canApproveIntegrator() && !integratorFor() && <BuilderFee />}

        {error && <p className="text-short">{error}</p>}
        <p className="text-faint">
          Lighter doesn&apos;t accept orders from restricted regions, including the United States and the United Kingdom.
          Market data works everywhere.
        </p>
      </ol>
    </Modal>
  );
}

function Funds({ onRobinhood }: { onRobinhood: boolean }) {
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  return (
    <div className="flex flex-col gap-2">
      <Tabs value={tab} onChange={setTab} items={[{ value: "deposit", label: "Deposit" }, { value: "withdraw", label: "Withdraw" }]} />
      {tab === "withdraw" ? <Withdraw /> : !onRobinhood ? <p className="text-warn">Switch your wallet to {robinhood.name} first.</p> : <Deposit />}
    </div>
  );
}

function Deposit() {
  const { address } = useConnection();
  const [amount, setAmount] = useState("");
  const [bal, setBal] = useState<{ balance: bigint; allowance: bigint } | null>(null);
  const [busy, setBusy] = useState<"approve" | "deposit" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!address) return;
    readUsdg(address).then(setBal).catch((e) => logError("usdg balance", e));
  }, [address]);
  useEffect(load, [load]);

  const balance = bal ? Number(formatUnits(bal.balance, COLLATERAL.decimals)) : 0;
  const allowance = bal ? Number(formatUnits(bal.allowance, COLLATERAL.decimals)) : 0;
  const amt = Number(amount) || 0;
  const needsApproval = amt > 0 && allowance < amt;

  const act = async (kind: "approve" | "deposit") => {
    if (!address) return;
    setBusy(kind);
    setErr(null);
    const { push, update } = useToasts.getState();
    const id = push({ title: kind === "approve" ? `Approve ${COLLATERAL.symbol}` : `Deposit ${amt} ${COLLATERAL.symbol}`, state: "pending", detail: "Confirm in your wallet" });
    try {
      if (kind === "approve") await approveUsdg(amount);
      else {
        await depositUsdg(address, amount);
        setAmount("");
      }
      update(id, { state: "success", detail: kind === "approve" ? "Approved" : "Deposit confirmed on Robinhood Chain. Lighter credits it shortly." });
    } catch (e) {
      logError(kind, e);
      const msg = humanizeError(e);
      setErr(msg);
      update(id, { state: "failed", detail: msg });
    } finally {
      setBusy(null);
      load();
    }
  };

  return (
    <div className="flex flex-col gap-2 text-muted">
      <div className="flex justify-between"><span>Wallet balance</span><span className="num text-fg">{bal ? `${balance.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${COLLATERAL.symbol}` : <Spinner />}</span></div>
      <label className="flex items-center gap-2 rounded border border-line-2 bg-panel px-2.5 py-2">
        <span className="text-faint">Amount</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="num flex-1 bg-transparent outline-none" />
        <button className="text-accent text-[11px]" onClick={() => bal && setAmount(formatUnits(bal.balance, COLLATERAL.decimals))} disabled={!balance}>Max</button>
      </label>
      {amt > balance && <p className="text-short">Amount is more than your wallet balance.</p>}
      {needsApproval ? (
        <Button onClick={() => act("approve")} disabled={busy !== null || amt > balance} className="self-start">{busy === "approve" ? "Confirm in wallet…" : `Approve ${COLLATERAL.symbol}`}</Button>
      ) : (
        <Button variant="accent" onClick={() => act("deposit")} disabled={busy !== null || !(amt > 0) || amt > balance} className="self-start">{busy === "deposit" ? "Confirm in wallet…" : "Deposit"}</Button>
      )}
      {err && <p className="text-short">{err}</p>}
      <p className="text-faint">
        Deposits go to Lighter&apos;s contract on {robinhood.name}, with a small network fee in ETH. Need {COLLATERAL.symbol}?{" "}
        <a href={LINKS.robinhoodBridging} target="_blank" rel="noreferrer" className="text-accent">Robinhood Chain bridging ↗</a>
      </p>
    </div>
  );
}

function Withdraw() {
  const account = useSession((s) => s.account);
  const summary = accountSummary(account);
  const available = summary?.available ?? 0;
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const amt = Number(amount) || 0;
  const maxWithdraw = Math.floor(available * 10 ** COLLATERAL.decimals) / 10 ** COLLATERAL.decimals;

  const go = async () => {
    setBusy(true);
    setErr(null);
    const { push, update } = useToasts.getState();
    const id = push({ title: `Withdraw ${amt} ${COLLATERAL.symbol}`, state: "pending", detail: "Sending to Lighter…" });
    try {
      await withdrawUsdg(amount);
      setAmount("");
      update(id, { state: "success", detail: `Withdrawal requested. It arrives at your wallet on ${robinhood.name} once Lighter processes it.` });
    } catch (e) {
      logError("withdraw", e);
      const msg = humanizeError(e);
      setErr(msg);
      update(id, { state: "failed", detail: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 text-muted">
      <div className="flex justify-between"><span>Available</span><span className="num text-fg">{fmtUsd(available)}</span></div>
      {summary && <div className="flex justify-between text-faint"><span>Account equity</span><span className="num">{fmtUsd(summary.equity)}</span></div>}
      <label className="flex items-center gap-2 rounded border border-line-2 bg-panel px-2.5 py-2">
        <span className="text-faint">Amount</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="num flex-1 bg-transparent outline-none" />
        <button className="text-accent text-[11px]" onClick={() => setAmount(String(maxWithdraw))} disabled={!(maxWithdraw > 0)}>Max</button>
      </label>
      {amt > maxWithdraw && <p className="text-short">Amount is more than you can withdraw.</p>}
      {amt > 0 && amt < COLLATERAL.minWithdraw && <p className="text-short">Minimum withdrawal is {COLLATERAL.minWithdraw} {COLLATERAL.symbol}.</p>}
      <Button variant="accent" onClick={go} disabled={busy || !(amt >= COLLATERAL.minWithdraw) || amt > maxWithdraw} className="self-start">{busy ? "Sending…" : "Withdraw"}</Button>
      {err && <p className="text-short">{err}</p>}
      <p className="text-faint">Withdrawals always go to your connected address on {robinhood.name}.</p>
    </div>
  );
}

function BuilderFee() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pct = (v: number) => `${((v / 1_000_000) * 100).toFixed(4)}%`;
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await approveIntegrator();
      useToasts.getState().push({ title: "Builder fee approved", state: "success" });
    } catch (e) {
      logError("approve integrator", e);
      setErr(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="rounded border border-line-2 p-3 flex flex-col gap-2 text-muted">
      <div className="text-fg font-medium">Optional: support Elyperp</div>
      <p>
        Your Lighter tier allows partner fees. You can approve Elyperp&apos;s builder fee of {pct(INTEGRATOR.takerFee)} taker
        and {pct(INTEGRATOR.makerFee)} maker on your orders. Nothing is charged unless you approve it, and the approval lasts 180 days.
      </p>
      <Button onClick={go} disabled={busy} className="self-start">{busy ? "Confirm in wallet…" : "Approve builder fee"}</Button>
      {err && <p className="text-short">{err}</p>}
    </li>
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={clsx("mt-0.5 h-5 w-5 shrink-0 rounded-full grid place-items-center text-[10px] font-semibold",
        done ? "bg-accent text-black" : "border border-line-2 text-muted")}>{done ? "✓" : n}</span>
      <div className="flex-1 min-w-0">
        <div className="text-fg font-medium mb-1">{title}</div>
        {children}
      </div>
    </li>
  );
}
