"use client";
import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMarketBySlug, useMarkets, usePrefs } from "@/store/markets";
import { useAccountStage } from "@/lib/lighter/session";
import { useOpenOrders, usePositions } from "@/lib/lighter/positions";
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
  const positions = usePositions(market?.id ?? -1);
  const orders = useOpenOrders(market?.id ?? -1);
  const [mobileTab, setMobileTab] = useState<"chart" | "book" | "trade">("chart");
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isWide = useMediaQuery("(min-width: 1024px)");

  const lines = useMemo<ChartLine[]>(() => {
    const out: ChartLine[] = [];
    if (!market || stage !== "ready") return out;
    for (const p of positions) {
      const long = p.qty > 0;
      out.push({ price: p.entry, color: long ? "#18d98b" : "#f2495e", title: `Entry ${long ? "long" : "short"}` });
      if (p.liq) out.push({ price: p.liq, color: "#f2b84b", title: "Liq.", dashed: true });
    }
    for (const o of orders) {
      const px = Number(o.trigger_price) > 0 ? Number(o.trigger_price) : Number(o.price);
      if (px > 0) out.push({ price: px, color: o.is_ask ? "#f2495e99" : "#18d98b99", title: o.type.replace(/-/g, " "), dashed: true });
    }
    return out;
  }, [positions, orders, market, stage]);

  if (!loaded) {
    return (
      <div className="flex-1 grid place-items-center text-sm text-muted">
        {error ? <span className="text-short max-w-md text-center">Couldn&apos;t load markets from Lighter: {error}</span> : <span className="flex items-center gap-2"><Spinner /> Loading markets…</span>}
      </div>
    );
  }
  if (!market) {
    return (
      <div className="flex-1 grid place-items-center text-sm text-muted text-center px-4">
        <div>
          <p>Market <span className="num text-fg">{slug}</span> isn&apos;t listed on Lighter&apos;s Robinhood Chain exchange.</p>
          <Link href="/markets" className="text-accent mt-2 inline-block">Browse available markets →</Link>
        </div>
      </div>
    );
  }

  const chart = <Chart marketId={market.id} pricePrecision={market.pxDecimals} lines={lines} />;

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
            <AccountTabs filterMarketId={market.id} className="flex-1 min-w-0" />
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
          <AccountTabs filterMarketId={market.id} className="min-h-[300px]" />
        </div>
      )}
    </div>
  );
}
