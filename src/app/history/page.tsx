"use client";
import { useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { useAccountStore } from "@/store/account";
import { Empty, Tabs } from "@/components/ui/primitives";
import { FillsTable, FundingTable } from "@/components/trade/AccountTabs";

export default function HistoryPage() {
  const { isConnected } = useConnection();
  const fills = useAccountStore((s) => s.fills);
  const [tab, setTab] = useState<"fills" | "funding">("fills");
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"all" | "open" | "close">("all");

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return fills
      .filter((f) => !ql || f.coin.toLowerCase().includes(ql))
      .filter((f) => dir === "all" || f.dir.toLowerCase().startsWith(dir));
  }, [fills, q, dir]);

  const exportCsv = () => {
    const rows = [["time", "coin", "dir", "side", "px", "sz", "fee", "closedPnl", "oid", "hash"]];
    filtered.forEach((f) => rows.push([new Date(f.time).toISOString(), f.coin, f.dir, f.side, f.px, f.sz, String((f as { fee?: string }).fee ?? ""), f.closedPnl, String(f.oid), f.hash]));
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "elyperp-trades.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!isConnected) return <div className="p-6"><Empty>Connect a wallet to view your trade history.</Empty></div>;

  return (
    <div className="p-3 md:p-5 max-w-7xl w-full mx-auto flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Trade History</h1>
      <div className="panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line pr-2">
          <Tabs value={tab} onChange={setTab} className="px-1" items={[{ value: "fills", label: `Fills (${fills.length})` }, { value: "funding", label: "Funding (7d)" }]} />
          <div className="flex-1" />
          {tab === "fills" && (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter market" className="bg-panel-2 border border-line-2 rounded px-2 py-1 text-xs outline-none" />
              <select value={dir} onChange={(e) => setDir(e.target.value as typeof dir)} className="bg-panel-2 border border-line-2 rounded px-2 py-1 text-xs text-muted">
                <option value="all">All</option><option value="open">Opens</option><option value="close">Closes</option>
              </select>
              <button onClick={exportCsv} className="text-xs text-accent px-2 py-1" disabled={!filtered.length}>Export CSV</button>
            </>
          )}
        </div>
        <div className="overflow-x-auto scroll-thin">{tab === "fills" ? <FillsTable fills={filtered} /> : <FundingTable />}</div>
      </div>
      <p className="text-[11px] text-faint">Shows your 500 most recent fills from Hyperliquid&apos;s userFills endpoint, updated live as new fills stream in.</p>
    </div>
  );
}
