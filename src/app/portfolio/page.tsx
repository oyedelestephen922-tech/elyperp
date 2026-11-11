"use client";
import { useState } from "react";
import { useCollateral, useHoldingStream, useMarginRatio, useOrderStream, usePositionStream } from "@orderly.network/hooks";
import { OrderStatus } from "@orderly.network/types";
import { fmtPct, fmtUsd, pnlClass } from "@/lib/format";
import { openConnect, openOnboard, useAccountStage } from "@/lib/orderly/account";
import { Button, Empty, Spinner, Tabs } from "@/components/ui/primitives";
import { FundingTable, OrdersTable, PositionsTable, TradesTable } from "@/components/trade/AccountTabs";

export default function PortfolioPage() {
  const { stage } = useAccountStage();
  if (stage === "unavailable") return <div className="p-6"><Empty>Trading opens soon. Your portfolio will show here once accounts are live.</Empty></div>;
  if (stage === "disconnected") {
    return (
      <div className="p-6 flex flex-col items-center gap-3">
        <Empty>Connect a wallet to view your portfolio.</Empty>
        <Button variant="accent" onClick={openConnect}>Connect wallet</Button>
      </div>
    );
  }
  if (stage === "checking") return <div className="p-6 grid place-items-center"><Spinner /></div>;
  if (stage !== "ready") {
    return (
      <div className="p-6 flex flex-col items-center gap-3">
        <Empty>Finish account setup to see your portfolio.</Empty>
        <Button variant="accent" onClick={openOnboard}>Account setup</Button>
      </div>
    );
  }
  return <Portfolio />;
}

function Portfolio() {
  const { totalCollateral, freeCollateral, totalValue, unsettledPnL } = useCollateral({ dp: 2 });
  const { marginRatio, currentLeverage, mmr } = useMarginRatio();
  const { data: holdings } = useHoldingStream();
  const [{ rows, aggregated }] = usePositionStream();
  const [orders] = useOrderStream({ status: OrderStatus.INCOMPLETE, size: 100 });
  const [tab, setTab] = useState<"positions" | "orders" | "history" | "funding">("positions");
  const positions = (rows ?? []).filter((p) => p.position_qty !== 0);
  const upnl = Number(aggregated?.total_unreal_pnl ?? aggregated?.unrealPnL ?? 0);
  // margin ratio from Orderly: collateral / maintenance requirement. Liquidation happens when it falls to the MMR.
  const atRisk = mmr != null && marginRatio > 0 && marginRatio < mmr * 1.5;

  return (
    <div className="p-3 md:p-5 max-w-7xl w-full mx-auto flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Portfolio</h1>
          <p className="text-xs text-muted mt-1">Live from your Orderly account.</p>
        </div>
        <Button onClick={openOnboard}>Deposit & withdraw</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card label="Total value" value={fmtUsd(totalValue ?? totalCollateral)} hint="Collateral plus unrealized PnL" />
        <Card label="Free collateral" value={fmtUsd(freeCollateral)} hint="Available for new orders" />
        <Card label="Unrealized PnL" value={<span className={pnlClass(upnl)}>{fmtUsd(upnl)}</span>} />
        <Card label="Unsettled PnL" value={<span className={pnlClass(unsettledPnL)}>{fmtUsd(unsettledPnL)}</span>} hint="Settled to your balance on withdrawal" />
        <Card label="Account leverage" value={currentLeverage != null ? `${currentLeverage.toFixed(2)}x` : "--"} />
        <Card label="Margin ratio" value={marginRatio > 0 ? fmtPct(marginRatio, 1, false) : "--"} hint={mmr != null ? `Liquidation at ${fmtPct(mmr, 1, false)}` : "No open positions"} />
      </div>

      {atRisk && <div className="panel border-short/40 px-3 py-2 text-xs text-short">Liquidation risk: your margin ratio is close to the maintenance level. Add collateral or reduce positions.</div>}

      <div className="panel p-3">
        <div className="text-xs text-muted mb-2">Balances</div>
        <div className="flex flex-col gap-1.5 text-xs">
          {(holdings ?? []).filter((h) => h.holding !== 0 || h.frozen !== 0).map((h) => (
            <div key={h.token} className="flex justify-between">
              <span>{h.token}</span>
              <span className="num">{h.holding.toLocaleString("en-US", { maximumFractionDigits: 6 })}{h.frozen ? <span className="text-faint"> ({h.frozen} in orders)</span> : null}</span>
            </div>
          ))}
          {!(holdings ?? []).some((h) => h.holding !== 0) && <span className="text-muted">No collateral deposited yet.</span>}
        </div>
      </div>

      <div className="panel">
        <Tabs value={tab} onChange={setTab} className="border-b border-line px-1" items={[
          { value: "positions", label: `Open positions (${positions.length})` },
          { value: "orders", label: `Open orders (${(orders ?? []).length})` },
          { value: "history", label: "Trade history" },
          { value: "funding", label: "Funding payments" },
        ]} />
        <div className="overflow-x-auto scroll-thin">
          {tab === "positions" && <PositionsTable positions={positions} />}
          {tab === "orders" && <OrdersTable orders={(orders ?? []) as never[]} />}
          {tab === "history" && <TradesTable />}
          {tab === "funding" && <FundingTable />}
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
