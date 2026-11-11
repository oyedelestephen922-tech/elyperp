"use client";
import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import { useSwitchChain } from "wagmi";
import { useCollateral, useDeposit, useWithdraw } from "@orderly.network/hooks";
import { Button, Modal, Spinner, Tabs } from "@/components/ui/primitives";
import { COLLATERAL, LINKS, TRADING_ENABLED, robinhood } from "@/lib/config";
import { fmtUsd } from "@/lib/format";
import { humanizeError, logError } from "@/lib/errors";
import { useAccountStage } from "@/lib/orderly/account";
import { useToasts } from "@/store/toasts";

export function OnboardingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { stage, address, chainId, onRobinhood, createAccount, createOrderlyKey } = useAccountStage();
  const { mutate: switchChain, isPending: switching } = useSwitchChain();
  const [busy, setBusy] = useState<"account" | "key" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const push = useToasts((s) => s.push);

  const run = async (kind: "account" | "key") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "account") await createAccount();
      else await createOrderlyKey(true);
      push({ title: kind === "account" ? "Elyperp account created" : "Trading enabled on this device", state: "success" });
    } catch (e) {
      logError(kind === "account" ? "createAccount" : "createOrderlyKey", e);
      setError(humanizeError(e));
    } finally {
      setBusy(null);
    }
  };

  const hasAccount = stage === "no_key" || stage === "ready";

  return (
    <Modal open={open} onClose={onClose} title="Account setup & funds" width="max-w-xl">
      {!TRADING_ENABLED ? (
        <p className="text-xs text-muted">Trading on Elyperp opens soon. Market data is live now; account setup will appear here once trading opens.</p>
      ) : (
        <ol className="flex flex-col gap-3 text-xs">
          <Step n={1} done={!!address} title="Wallet connected">
            <span className="num text-muted break-all">{address}</span>
          </Step>

          <Step n={2} done={onRobinhood} title={`${robinhood.name} (chain ${robinhood.id})`}>
            {onRobinhood ? (
              <p className="text-muted">Connected to {robinhood.name}. Deposits and withdrawals use this network.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-warn">Your wallet is on chain {chainId}. Switch to {robinhood.name} to create your account and move funds.</p>
                <Button onClick={() => switchChain({ chainId: robinhood.id })} disabled={switching} className="self-start">
                  {switching ? "Switching…" : `Switch to ${robinhood.name}`}
                </Button>
              </div>
            )}
          </Step>

          <Step n={3} done={hasAccount} title="Create your Elyperp account">
            <div className="flex flex-col gap-2 text-muted">
              <p>Sign one message to open your trading account on Orderly&apos;s order book. This is free and doesn&apos;t send a transaction.</p>
              {stage === "checking" ? (
                <span className="flex items-center gap-2"><Spinner /> Checking your wallet…</span>
              ) : !hasAccount ? (
                <Button variant="accent" onClick={() => run("account")} disabled={!onRobinhood || busy !== null} className="self-start">
                  {busy === "account" ? "Confirm in wallet…" : "Create account"}
                </Button>
              ) : <span className="text-accent">Account found.</span>}
            </div>
          </Step>

          <Step n={4} done={stage === "ready"} title="Enable trading">
            <div className="flex flex-col gap-2 text-muted">
              <p>
                Sign once to create a trading key in this browser. It can place and cancel orders but
                <b className="text-fg"> cannot withdraw funds</b>. It lasts up to a year and you can forget it from the wallet menu.
              </p>
              {stage === "ready" ? (
                <span className="text-accent">Trading enabled on this device.</span>
              ) : (
                <Button variant="accent" onClick={() => run("key")} disabled={!hasAccount || busy !== null} className="self-start">
                  {busy === "key" ? "Confirm in wallet…" : "Enable trading"}
                </Button>
              )}
            </div>
          </Step>

          <Step n={5} done={false} title={`Fund with ${COLLATERAL.symbol}`}>
            {stage === "ready" ? <Funds onRobinhood={onRobinhood} /> : <p className="text-muted">Available once trading is enabled.</p>}
          </Step>

          {error && <p className="text-short">{error}</p>}
        </ol>
      )}
    </Modal>
  );
}

function Funds({ onRobinhood }: { onRobinhood: boolean }) {
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  return (
    <div className="flex flex-col gap-2">
      <Tabs value={tab} onChange={setTab} items={[{ value: "deposit", label: "Deposit" }, { value: "withdraw", label: "Withdraw" }]} />
      {!onRobinhood ? (
        <p className="text-warn">Switch your wallet to {robinhood.name} first.</p>
      ) : tab === "deposit" ? <Deposit /> : <Withdraw />}
    </div>
  );
}

function Deposit() {
  const { balance, allowance, depositFee, quantity, setQuantity, approve, deposit, balanceRevalidating } = useDeposit({
    address: COLLATERAL.address,
    decimals: COLLATERAL.decimals,
    srcChainId: robinhood.id,
    srcToken: COLLATERAL.symbol,
    dstToken: COLLATERAL.symbol,
  });
  const [busy, setBusy] = useState<"approve" | "deposit" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const amt = Number(quantity) || 0;
  const bal = Number(balance) || 0;
  const needsApproval = amt > 0 && Number(allowance) < amt;
  const fee = depositFee ? Number(formatUnits(depositFee, 18)) : 0;

  const act = async (kind: "approve" | "deposit") => {
    setBusy(kind);
    setErr(null);
    const { push, update } = useToasts.getState();
    const id = push({ title: kind === "approve" ? `Approve ${COLLATERAL.symbol}` : `Deposit ${amt} ${COLLATERAL.symbol}`, state: "pending", detail: "Confirm in your wallet" });
    try {
      if (kind === "approve") await approve(quantity);
      else {
        await deposit();
        setQuantity("");
      }
      update(id, { state: "success", detail: kind === "approve" ? "Approved" : "Deposit sent. It shows in your balance after Orderly confirms it, usually within a few minutes." });
    } catch (e) {
      logError(kind, e);
      const msg = humanizeError(e);
      setErr(msg);
      update(id, { state: "failed", detail: msg });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 text-muted">
      <div className="flex justify-between"><span>Wallet balance</span><span className="num text-fg">{balanceRevalidating && !balance ? <Spinner /> : `${bal.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${COLLATERAL.symbol}`}</span></div>
      <label className="flex items-center gap-2 rounded border border-line-2 bg-panel px-2.5 py-2">
        <span className="text-faint">Amount</span>
        <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="num flex-1 bg-transparent outline-none" />
        <button className="text-accent text-[11px]" onClick={() => setQuantity(String(bal))} disabled={!bal}>Max</button>
      </label>
      <div className="flex justify-between text-faint"><span>Network fee (paid in ETH)</span><span className="num">{fee ? `${fee.toFixed(6)} ETH` : "--"}</span></div>
      {amt > bal && <p className="text-short">Amount is more than your wallet balance.</p>}
      {needsApproval ? (
        <Button onClick={() => act("approve")} disabled={busy !== null || amt > bal} className="self-start">{busy === "approve" ? "Confirm in wallet…" : `Approve ${COLLATERAL.symbol}`}</Button>
      ) : (
        <Button variant="accent" onClick={() => act("deposit")} disabled={busy !== null || !(amt > 0) || amt > bal} className="self-start">{busy === "deposit" ? "Confirm in wallet…" : "Deposit"}</Button>
      )}
      {err && <p className="text-short">{err}</p>}
      <p className="text-faint">
        Need {COLLATERAL.symbol} on {robinhood.name}? Bridge it in with a route Robinhood lists:{" "}
        <a href={LINKS.robinhoodBridging} target="_blank" rel="noreferrer" className="text-accent">Robinhood Chain bridging ↗</a>
      </p>
    </div>
  );
}

function Withdraw() {
  const { maxAmount, unsettledPnL, withdraw, dst } = useWithdraw({ srcChainId: robinhood.id, token: COLLATERAL.symbol, decimals: COLLATERAL.decimals });
  const { freeCollateral } = useCollateral({ dp: 2 });
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const amt = Number(amount) || 0;

  const go = async () => {
    setBusy(true);
    setErr(null);
    const { push, update } = useToasts.getState();
    const id = push({ title: `Withdraw ${amt} ${COLLATERAL.symbol}`, state: "pending", detail: "Confirm in your wallet" });
    try {
      await withdraw({ chainId: robinhood.id, token: COLLATERAL.symbol, amount, allowCrossChainWithdraw: false });
      setAmount("");
      update(id, { state: "success", detail: `Withdrawal requested to ${dst?.network || robinhood.name}. It arrives after Orderly processes it.` });
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
      <div className="flex justify-between"><span>Withdrawable</span><span className="num text-fg">{maxAmount.toLocaleString("en-US", { maximumFractionDigits: 6 })} {COLLATERAL.symbol}</span></div>
      <div className="flex justify-between text-faint"><span>Free collateral</span><span className="num">{fmtUsd(freeCollateral)}</span></div>
      {unsettledPnL !== 0 && <div className="flex justify-between text-faint"><span>Unsettled PnL</span><span className="num">{fmtUsd(unsettledPnL)}</span></div>}
      <label className="flex items-center gap-2 rounded border border-line-2 bg-panel px-2.5 py-2">
        <span className="text-faint">Amount</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="num flex-1 bg-transparent outline-none" />
        <button className="text-accent text-[11px]" onClick={() => setAmount(String(maxAmount))} disabled={!maxAmount}>Max</button>
      </label>
      {amt > maxAmount && <p className="text-short">Amount is more than you can withdraw.</p>}
      <Button variant="accent" onClick={go} disabled={busy || !(amt > 0) || amt > maxAmount} className="self-start">{busy ? "Confirm in wallet…" : "Withdraw"}</Button>
      {err && <p className="text-short">{err}</p>}
      <p className="text-faint">Withdrawals go to your connected address on {robinhood.name}. Orderly charges a small withdrawal fee in {COLLATERAL.symbol}.</p>
    </div>
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
