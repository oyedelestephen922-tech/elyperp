"use client";
import { useState } from "react";
import { openConnect, openOnboard, useAccountStage } from "@/lib/lighter/session";
import { useMarkets } from "@/store/markets";
import { Button, Empty, Spinner, Tabs } from "@/components/ui/primitives";
import { FundingTable, TradesTable } from "@/components/trade/AccountTabs";

export default function HistoryPage() {
  const { stage } = useAccountStage();
  if (stage === "disconnected") return <div className="p-6 flex flex-col items-center gap-3"><Empty>Connect a wallet to view your trade history.</Empty><Button variant="accent" onClick={openConnect}>Connect wallet</Button></div>;
  if (stage === "checking") return <div className="p-6 grid place-items-center"><Spinner /></div>;
  if (stage !== "ready") return <div className="p-6 flex flex-col items-center gap-3"><Empty>Enable trading in this browser to see your history.</Empty><Button variant="accent" onClick={openOnboard}>Account setup</Button></div>;
  return <History />;
}

function History() {
  const markets = useMarkets((s) => s.markets);
  const slugs = useMarkets((s) => s.slugs);
  const [tab, setTab] = useState<"fills" | "funding">("fills");
  const [q, setQ] = useState("");
  const symbol = q.trim() ? slugs[q.trim().toLowerCase()] : undefined;
  const marketId = symbol ? markets[symbol]?.id : undefined;

  return (
    <div className="p-3 md:p-5 max-w-7xl w-full mx-auto flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Trade History</h1>
      <div className="panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line pr-2">
          <Tabs value={tab} onChange={setTab} className="px-1" items={[{ value: "fills", label: "Fills" }, { value: "funding", label: "Funding" }]} />
          <div className="flex-1" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Market (e.g. BTC)" className="bg-panel-2 border border-line-2 rounded px-2 py-1 text-xs outline-none" />
        </div>
        <div className="overflow-x-auto scroll-thin">
          {q.trim() && !symbol ? <Empty>No market called “{q.trim()}”.</Empty> : tab === "fills" ? <TradesTable marketId={marketId} limit={100} /> : <FundingTable marketId={marketId} />}
        </div>
      </div>
      <p className="text-[11px] text-faint">Shows your 100 most recent fills and funding payments from Lighter.</p>
    </div>
  );
}
