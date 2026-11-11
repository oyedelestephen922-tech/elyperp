"use client";
import { useMemo, useState } from "react";
import { usePrivateQuery } from "@orderly.network/hooks";
import { openConnect, openOnboard, useAccountStage } from "@/lib/orderly/account";
import { useMarkets } from "@/store/markets";
import { Button, Empty, Spinner, Tabs } from "@/components/ui/primitives";
import { FundingTable, TradesTable } from "@/components/trade/AccountTabs";

interface TradeRow {
  id: number; symbol: string; side: string; executed_price: number; executed_quantity: number; executed_timestamp: number;
  fee: number; fee_asset?: string; realized_pnl?: number | null; order_id?: number;
}

export default function HistoryPage() {
  const { stage } = useAccountStage();
  if (stage === "unavailable") return <div className="p-6"><Empty>Trading opens soon. Your trade history will show here.</Empty></div>;
  if (stage === "disconnected") return <div className="p-6 flex flex-col items-center gap-3"><Empty>Connect a wallet to view your trade history.</Empty><Button variant="accent" onClick={openConnect}>Connect wallet</Button></div>;
  if (stage === "checking") return <div className="p-6 grid place-items-center"><Spinner /></div>;
  if (stage !== "ready") return <div className="p-6 flex flex-col items-center gap-3"><Empty>Finish account setup to see your history.</Empty><Button variant="accent" onClick={openOnboard}>Account setup</Button></div>;
  return <History />;
}

function History() {
  const markets = useMarkets((s) => s.markets);
  const slugs = useMarkets((s) => s.slugs);
  const [tab, setTab] = useState<"fills" | "funding">("fills");
  const [q, setQ] = useState("");
  const symbol = q.trim() ? slugs[q.trim().toLowerCase()] : undefined;
  const qs = new URLSearchParams({ size: "500", ...(symbol ? { symbol } : {}) });
  const { data } = usePrivateQuery<TradeRow[]>(`/v1/trades?${qs}`, { revalidateOnFocus: false });
  const rows = useMemo(() => [...(data ?? [])].sort((a, b) => b.executed_timestamp - a.executed_timestamp), [data]);

  const exportCsv = () => {
    const out = [["time", "market", "side", "price", "size", "fee", "fee_asset", "realized_pnl", "order_id", "trade_id"]];
    rows.forEach((f) => out.push([
      new Date(f.executed_timestamp).toISOString(), markets[f.symbol]?.base ?? f.symbol, f.side, String(f.executed_price), String(f.executed_quantity),
      String(f.fee), f.fee_asset ?? "", f.realized_pnl == null ? "" : String(f.realized_pnl), String(f.order_id ?? ""), String(f.id),
    ]));
    const blob = new Blob([out.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "elyperp-trades.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="p-3 md:p-5 max-w-7xl w-full mx-auto flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Trade History</h1>
      <div className="panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line pr-2">
          <Tabs value={tab} onChange={setTab} className="px-1" items={[{ value: "fills", label: "Fills" }, { value: "funding", label: "Funding" }]} />
          <div className="flex-1" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Market (e.g. BTC)" className="bg-panel-2 border border-line-2 rounded px-2 py-1 text-xs outline-none" />
          {tab === "fills" && <button onClick={exportCsv} className="text-xs text-accent px-2 py-1" disabled={!rows.length}>Export CSV</button>}
        </div>
        <div className="overflow-x-auto scroll-thin">
          {q.trim() && !symbol ? <Empty>No market called “{q.trim()}”.</Empty> : tab === "fills" ? <TradesTable symbol={symbol} limit={500} /> : <FundingTable symbol={symbol} />}
        </div>
      </div>
      <p className="text-[11px] text-faint">Shows up to your 500 most recent fills from Orderly.</p>
    </div>
  );
}
