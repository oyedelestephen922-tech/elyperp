"use client";
import { useState } from "react";
import { fmtPct, fmtUsd, pnlClass } from "@/lib/format";
import { openConnect, openOnboard, useAccountStage, useSession } from "@/lib/lighter/session";
import { accountSummary, useOpenOrders, usePositions } from "@/lib/lighter/positions";
import { Button, Empty, Spinner, Tabs } from "@/components/ui/primitives";
import { FundingTable, OrdersTable, PositionsTable, TradesTable } from "@/components/trade/AccountTabs";

export default function PortfolioPage() {
  const { stage } = useAccountStage();
  if (stage === "disconnected") {
    return (
      <div className="p-6 flex flex-col items-center gap-3">
        <Empty>Connect a wallet to view your portfolio.</Empty>
        <Button variant="accent" onClick={openConnect}>Connect wallet</Button>
      </div>
    );
  }
  if (stage === "checking") return <div className="p-6 grid place-items-center"><Spinner /></div>;
  if (stage === "no_account") {
    return (
      <div className="p-6 flex flex-col items-center gap-3">
        <Empty>This wallet has no Lighter account yet. Deposit USDG to open one.</Empty>
        <Button variant="accent" onClick={openOnboard}>Deposit</Button>
      </div>
    );
  }
  return <Portfolio />;
}

function Portfolio() {
  const { stage, accountIndex } = useAccountStage();
  const account = useSession((s) => s.account);
  const tier = useSession((s) => s.tier);
  const sum = accountSummary(account);
  const positions = usePositions();
  const orders = useOpenOrders();
  const [tab, setTab] = useState<"positions" | "orders" | "history" | "funding">("positions");
  const ready = stage === "ready";
  const upnl = positions.reduce((a, p) => a + p.upnl, 0);
  const notional = positions.reduce((a, p) => a + p.value, 0);
  const leverage = sum && sum.equity > 0 ? notional / sum.equity : null;
  // Cross-margin health: equity over the maintenance requirement. Liquidation starts when equity falls to it.
  const health = sum && sum.maintenance > 0 ? sum.equity / sum.maintenance : null;
  const atRisk = health != null && health < 1.5;

  return (
    <div className="p-3 md:p-5 max-w-7xl w-full mx-auto flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Portfolio</h1>
          <p className="text-xs text-muted mt-1">Live from Lighter account #{accountIndex}{tier ? ` (${tier})` : ""}.</p>
        </div>
        <Button onClick={openOnboard}>{ready ? "Deposit & withdraw" : "Enable trading"}</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card label="Equity" value={sum ? fmtUsd(sum.equity) : null} hint="Collateral plus unrealized PnL" />
        <Card label="Available" value={sum ? fmtUsd(sum.available) : null} hint="Free for new orders and withdrawals" />
        <Card label="Unrealized PnL" value={sum ? <span className={pnlClass(upnl)}>{fmtUsd(upnl)}</span> : null} />
        <Card label="Collateral" value={sum ? fmtUsd(sum.collateral) : null} hint="USDG deposited, plus realized PnL" />
        <Card label="Account leverage" value={sum ? (leverage != null ? `${leverage.toFixed(2)}x` : "--") : null} hint="Open notional / equity" />
        <Card label="Margin health" value={sum ? (health != null ? fmtPct(health, 0, false) : "--") : null} hint={health != null ? "Equity / maintenance margin. Liquidation at 100%." : "No open positions"} />
      </div>

      {atRisk && <div className="panel border-short/40 px-3 py-2 text-xs text-short">Liquidation risk: your equity is close to the maintenance margin. Add collateral or reduce positions.</div>}

      <div className="panel">
        <Tabs value={tab} onChange={setTab} className="border-b border-line px-1" items={[
          { value: "positions", label: `Open positions (${positions.length})` },
          { value: "orders", label: `Open orders (${ready ? orders.length : 0})` },
          { value: "history", label: "Trade history" },
          { value: "funding", label: "Funding payments" },
        ]} />
        <div className="overflow-x-auto scroll-thin">
          {tab === "positions" ? <PositionsTable positions={positions} canTrade={ready} />
            : !ready ? <Empty>Enable trading in this browser to see orders and history.</Empty>
            : tab === "orders" ? <OrdersTable orders={orders} />
            : tab === "history" ? <TradesTable />
            : <FundingTable />}
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: React.ReactNode | null; hint?: string }) {
  return (
    <div className="panel px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className="num text-base mt-0.5">{value ?? <Spinner />}</div>
      {hint && <div className="text-[10px] text-faint mt-0.5">{hint}</div>}
    </div>
  );
}
