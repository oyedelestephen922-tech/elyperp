"use client";
import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useOrderStream, usePositionStream } from "@orderly.network/hooks";
import { OrderStatus } from "@orderly.network/types";
import { useMarketBySlug, useMarkets, usePrefs } from "@/store/markets";
import { useAccountStage } from "@/lib/orderly/account";
import { MarketHeader } from "./MarketHeader";
import { Chart, type ChartLine } from "./Chart";
import { BookAndTrades } from "./OrderBook";
import { OrderPanel } from "./OrderPanel";
import { AccountTabs } from "./AccountTabs";
import { Spinner, Tabs } from "@/components/ui/primitives";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export function TradeTerminal({ slug }: { slug: string }) {
  const market = useMarketBySlug(slug);
  const loaded = useMarkets((s) => s.loaded);
  const error = useMarkets((s) => s.error);
  const { layout, setLayout } = usePrefs();
  const { stage } = useAccountStage();
  const [{ rows: positions }] = usePositionStream(market?.symbol);
  const [orders] = useOrderStream({ symbol: market?.symbol, status: OrderStatus.INCOMPLETE, size: 100 }, { enabled: stage === "ready" && !!market });
  const [mobileTab, setMobileTab] = useState<"chart" | "book" | "trade">("chart");
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isWide = useMediaQuery("(min-width: 1024px)");

  const lines = useMemo<ChartLine[]>(() => {
    const out: ChartLine[] = [];
    if (!market || stage !== "ready") return out;
    for (const p of positions ?? []) {
      if (p.symbol !== market.symbol || !p.position_qty) continue;
      const long = p.position_qty > 0;
      out.push({ price: p.average_open_price, color: long ? "#18d98b" : "#f2495e", title: `Entry ${long ? "long" : "short"}` });
      if (p.est_liq_price && p.est_liq_price > 0) out.push({ price: p.est_liq_price, color: "#f2b84b", title: "Liq.", dashed: true });
    }
    for (const o of (orders ?? []) as { symbol: string; side: string; price?: number | null; trigger_price?: number; type?: string; algo_type?: string }[]) {
      if (o.symbol !== market.symbol) continue;
      const px = o.price || o.trigger_price;
      if (px) out.push({ price: px, color: o.side === "BUY" ? "#18d98b99" : "#f2495e99", title: (o.algo_type ?? o.type ?? "").toLowerCase(), dashed: true });
    }
    return out;
  }, [positions, orders, market, stage]);

  if (!loaded) {
    return (
      <div className="flex-1 grid place-items-center text-sm text-muted">
        {error ? <span className="text-short max-w-md text-center">Couldn&apos;t load markets from Orderly: {error}</span> : <span className="flex items-center gap-2"><Spinner /> Loading markets…</span>}
      </div>
    );
  }
  if (!market) {
    return (
      <div className="flex-1 grid place-items-center text-sm text-muted text-center px-4">
        <div>
          <p>Market <span className="num text-fg">{slug}</span> isn&apos;t listed on Orderly.</p>
          <Link href="/markets" className="text-accent mt-2 inline-block">Browse available markets →</Link>
        </div>
      </div>
    );
  }

  const chart = <Chart symbol={market.symbol} pricePrecision={market.pxDecimals} lines={lines} />;

  return (
    <div className="flex flex-col gap-1 p-1 flex-1 min-h-0">
      <MarketHeader market={market} />

      {isDesktop ? (
        <div className="flex flex-col gap-1 flex-1 min-h-0">
          <div className="flex gap-1 min-h-[460px] h-[62vh]">
            {layout === "bookLeft" && <BookAndTrades market={market} className="w-[260px] shrink-0" />}
            <div className="panel flex-1 min-w-0 overflow-hidden">{chart}</div>
            {layout === "standard" && isWide && <BookAndTrades market={market} className="w-[260px] shrink-0" />}
            <div className="w-[300px] lg:w-[320px] shrink-0 overflow-y-auto scroll-thin"><OrderPanel market={market} /></div>
          </div>
          <div className="flex gap-1 min-h-[260px] flex-1">
            <AccountTabs filterSymbol={market.symbol} className="flex-1 min-w-0" />
            {((layout === "standard" && !isWide) || layout === "chart") && (
              <BookAndTrades market={market} className={layout === "chart" ? "w-[300px] shrink-0" : "w-[260px] shrink-0"} />
            )}
          </div>
          <div className="flex justify-end gap-1 text-[11px] text-faint px-1">
            Layout:
            {(["standard", "chart", "bookLeft"] as const).map((l) => (
              <button key={l} onClick={() => setLayout(l)} className={clsx("px-1.5", layout === l ? "text-accent" : "hover:text-fg")}>
                {l === "standard" ? "Standard" : l === "chart" ? "Chart focus" : "Book left"}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <Tabs value={mobileTab} onChange={setMobileTab} className="panel" items={[
            { value: "chart", label: "Chart" }, { value: "book", label: "Order Book" }, { value: "trade", label: "Trade" },
          ]} />
          {mobileTab === "chart" && <div className="panel h-[55vh] overflow-hidden">{chart}</div>}
          {mobileTab === "book" && <BookAndTrades market={market} className="h-[60vh]" />}
          {mobileTab === "trade" && <OrderPanel market={market} />}
          <AccountTabs filterSymbol={market.symbol} className="min-h-[300px]" />
        </div>
      )}
    </div>
  );
}
