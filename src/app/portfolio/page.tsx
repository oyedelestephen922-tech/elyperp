"use client";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import type { PortfolioResponse } from "@nktkas/hyperliquid/api/info";
import { getInfo } from "@/lib/hl/clients";
import { humanizeError, logError } from "@/lib/hl/errors";
import { fmtCompact, fmtPct, fmtUsd, pnlClass } from "@/lib/format";
import { selectPositions, selectSummary, useAccountStore } from "@/store/account";
import { useMarkets } from "@/store/markets";
import { Button, Empty, Spinner, Tabs } from "@/components/ui/primitives";
import { FillsTable, FundingTable, OrdersTable, PositionsTable } from "@/components/trade/AccountTabs";

type Period = "day" | "week" | "month" | "allTime";

export default function PortfolioPage() {
  const { address, isConnected } = useConnection();
  const states = useAccountStore((s) => s.states);
  const orders = useAccountStore((s) => s.openOrders);
  const fills = useAccountStore((s) => s.fills);
  const loaded = useAccountStore((s) => s.loaded);
  const updatedAt = useAccountStore((s) => s.updatedAt);
  const accountError = useAccountStore((s) => s.error);
  const dexes = useMarkets((s) => s.dexes);
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [pErr, setPErr] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [tab, setTab] = useState<"positions" | "orders" | "history" | "funding">("positions");

  useEffect(() => {
    setPortfolio(null);
    if (!address) return;
    getInfo().portfolio({ user: address }).then(setPortfolio).catch((e) => { logError("portfolio", e); setPErr(humanizeError(e)); });
  }, [address]);

  const s = selectSummary(states);
  const positions = selectPositions(states);
  const realized = useMemo(() => fills.reduce((a, f) => a + Number(f.closedPnl) - Number((f as { fee?: string }).fee ?? 0), 0), [fills]);
  const perpKey = ("perp" + period[0].toUpperCase() + period.slice(1)) as `perp${Capitalize<Period>}`;
  const pdata = portfolio?.find(([k]) => k === perpKey)?.[1] ?? portfolio?.find(([k]) => k === period)?.[1];
  const allTime = portfolio?.find(([k]) => k === "perpAllTime")?.[1];
  const periodPnl = pdata?.pnlHistory.length ? Number(pdata.pnlHistory.at(-1)![1]) : null;
  const volume = allTime ? Number((allTime as { vlm?: string }).vlm ?? 0) : null;
  const staleAcct = loaded && Date.now() - updatedAt > 30_000;

  if (!isConnected) {
    return <div className="p-6"><Empty>Connect a wallet to view your portfolio. All figures come directly from your Hyperliquid account.</Empty></div>;
  }

  return (
    <div className="p-3 md:p-5 max-w-7xl w-full mx-auto flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Portfolio</h1>
          <p className="text-xs text-muted mt-1">
            Live from HyperCore across all dexes.{" "}
            {staleAcct || accountError ? <span className="text-warn">{accountError ?? "Last update over 30s ago, reconnecting."}</span> : loaded ? "Synced." : "Loading…"}
          </p>
        </div>
        <Button onClick={() => window.dispatchEvent(new Event("elyperp:onboard"))}>Deposit & setup</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card label="Account equity" value={loaded ? fmtUsd(s.equity) : null} />
        <Card label="Available margin" value={loaded ? fmtUsd(s.withdrawable) : null} hint="Withdrawable / free collateral" />
        <Card label="Used margin" value={loaded ? fmtUsd(s.used) : null} hint={loaded && s.equity > 0 ? `${fmtPct(s.used / s.equity, 1, false)} of equity` : undefined} />
        <Card label="Unrealized PnL" value={loaded ? <span className={pnlClass(s.upnl)}>{fmtUsd(s.upnl)}</span> : null} />
        <Card label="Realized PnL" value={<span className={pnlClass(realized)}>{fmtUsd(realized)}</span>} hint={`Net of fees, last ${fills.length} fills`} />
        <Card label={`PnL (${period === "allTime" ? "all time" : "1 " + period})`} value={periodPnl == null ? (pErr ? "--" : null) : <span className={pnlClass(periodPnl)}>{fmtUsd(periodPnl)}</span>} />
        <Card label="Total trading volume" value={volume == null ? (pErr ? "--" : null) : fmtCompact(volume)} hint="Perps, all time" />
        <Card
          label="Maintenance margin ratio"
          value={loaded ? <span className={s.marginRatio > 0.6 ? "text-short" : s.marginRatio > 0.3 ? "text-warn" : "text-long"}>{fmtPct(s.marginRatio, 1, false)}</span> : null}
          hint="Cross liquidation occurs at 100%"
        />
      </div>

      {s.marginRatio > 0.6 && <div className="panel border-short/40 px-3 py-2 text-xs text-short">Liquidation risk: your cross maintenance margin is above 60% of equity. Add collateral or reduce positions.</div>}

      <div className="grid md:grid-cols-3 gap-2">
        <div className="panel p-3 md:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted">Account value</span>
            <div className="flex gap-1 text-[11px]">
              {(["day", "week", "month", "allTime"] as const).map((p) => (
                <button key={p} onClick={() => setPeriod(p)} className={clsx("px-2 py-0.5 rounded", period === p ? "bg-raised text-fg" : "text-faint")}>{p === "allTime" ? "All" : "1" + p[0].toUpperCase()}</button>
              ))}
            </div>
          </div>
          {pdata ? <Sparkline points={pdata.accountValueHistory.map(([t, v]) => [t, Number(v)])} /> : <div className="h-40 grid place-items-center">{pErr ? <span className="text-xs text-muted">{pErr}</span> : <Spinner />}</div>}
        </div>
        <div className="panel p-3">
          <div className="text-xs text-muted mb-2">Balances by dex</div>
          <div className="flex flex-col gap-1.5 text-xs">
            {Object.entries(states).filter(([, st]) => Number(st.marginSummary.accountValue) !== 0 || st.assetPositions.length).map(([dex, st]) => {
              const d = dexes.find((x) => x.name === dex);
              return (
                <div key={dex || "hl"} className="flex justify-between">
                  <span>{d?.fullName ?? (dex || "Hyperliquid")} <span className="text-faint">{d?.collateral}</span></span>
                  <span className="num">{fmtUsd(Number(st.marginSummary.accountValue))}</span>
                </div>
              );
            })}
            {loaded && s.equity === 0 && <span className="text-muted">No collateral deposited yet.</span>}
          </div>
        </div>
      </div>

      <div className="panel">
        <Tabs value={tab} onChange={setTab} className="border-b border-line px-1" items={[
          { value: "positions", label: `Open positions (${positions.length})` },
          { value: "orders", label: `Open orders (${orders.length})` },
          { value: "history", label: "Trade history" },
          { value: "funding", label: "Funding payments" },
        ]} />
        <div className="overflow-x-auto scroll-thin">
          {tab === "positions" && <PositionsTable positions={positions} orders={orders} />}
          {tab === "orders" && <OrdersTable orders={orders} />}
          {tab === "history" && <FillsTable fills={fills} />}
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

function Sparkline({ points }: { points: [number, number][] }) {
  if (points.length < 2) return <Empty>Not enough history yet.</Empty>;
  const w = 600, h = 160;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => ((x - x0) / (x1 - x0 || 1)) * w;
  const sy = (y: number) => h - 8 - ((y - y0) / (y1 - y0 || 1)) * (h - 16);
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join("");
  const up = ys.at(-1)! >= ys[0];
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40" preserveAspectRatio="none" role="img" aria-label="Account value over time">
        <path d={`${d}L${w},${h}L0,${h}Z`} fill={up ? "#18d98b14" : "#f2495e14"} />
        <path d={d} fill="none" stroke={up ? "#18d98b" : "#f2495e"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-faint num"><span>{fmtUsd(y0)} min</span><span>{fmtUsd(y1)} max</span></div>
    </div>
  );
}
