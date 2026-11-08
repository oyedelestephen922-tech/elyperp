"use client";
import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import type { UserFundingResponse } from "@nktkas/hyperliquid/api/info";
import { useTrading } from "@/components/providers/TradingProvider";
import { Badge, Button, Empty, Modal, Spinner, Tabs } from "@/components/ui/primitives";
import { fmtDateTime, fmtPct, fmtPx, fmtSize, fmtUsd, pnlClass } from "@/lib/format";
import { getInfo } from "@/lib/hl/clients";
import { humanizeError, logError } from "@/lib/hl/errors";
import { coinToPath, type Market } from "@/lib/hl/markets";
import { cancelOrder, closePosition, setPositionTpsl, type LegResult } from "@/lib/hl/trade";
import { isValidPrice, roundPrice } from "@/lib/hl/math";
import { selectPositions, useAccountStore, type OpenOrderRow, type PositionRow } from "@/store/account";
import { useMarkets, usePrefs } from "@/store/markets";
import { useToasts } from "@/store/toasts";

type Tab = "positions" | "orders" | "history" | "funding";

export function AccountTabs({ className, filterCoin }: { className?: string; filterCoin?: string }) {
  const { isConnected } = useConnection();
  const states = useAccountStore((s) => s.states);
  const orders = useAccountStore((s) => s.openOrders);
  const fills = useAccountStore((s) => s.fills);
  const [tab, setTab] = useState<Tab>("positions");
  const [onlyThis, setOnlyThis] = useState(false);
  const positions = selectPositions(states).filter((p) => !onlyThis || !filterCoin || p.coin === filterCoin);
  const visibleOrders = orders.filter((o) => !onlyThis || !filterCoin || o.coin === filterCoin);
  const visibleFills = fills.filter((f) => !onlyThis || !filterCoin || f.coin === filterCoin);

  return (
    <div className={clsx("panel flex flex-col min-h-0", className)}>
      <div className="flex items-center border-b border-line pr-2">
        <Tabs value={tab} onChange={setTab} className="flex-1 px-1" items={[
          { value: "positions", label: `Positions (${positions.length})` },
          { value: "orders", label: `Open Orders (${visibleOrders.length})` },
          { value: "history", label: "Trade History" },
          { value: "funding", label: "Funding" },
        ]} />
        {filterCoin && (
          <label className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap">
            <input type="checkbox" checked={onlyThis} onChange={(e) => setOnlyThis(e.target.checked)} className="accent-[#18d98b]" /> This market only
          </label>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto scroll-thin">
        {!isConnected ? (
          <Empty>Connect a wallet to see your positions, orders and history.</Empty>
        ) : tab === "positions" ? (
          <PositionsTable positions={positions} orders={orders} />
        ) : tab === "orders" ? (
          <OrdersTable orders={visibleOrders} />
        ) : tab === "history" ? (
          <FillsTable fills={visibleFills} />
        ) : (
          <FundingTable coin={onlyThis ? filterCoin : undefined} />
        )}
      </div>
    </div>
  );
}

const th = "px-3 py-2 text-left font-normal text-faint whitespace-nowrap";
const td = "px-3 py-1.5 whitespace-nowrap";

export function PositionsTable({ positions, orders }: { positions: PositionRow[]; orders: OpenOrderRow[] }) {
  const markets = useMarkets((s) => s.markets);
  const { exchange } = useTrading();
  const slippage = usePrefs((s) => s.slippage);
  const push = useToasts((s) => s.push);
  const update = useToasts((s) => s.update);
  const [closing, setClosing] = useState<PositionRow | null>(null);
  const [tpslFor, setTpslFor] = useState<PositionRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!positions.length) return <Empty>No open positions.</Empty>;

  const marketClose = async (p: PositionRow) => {
    const m = markets[p.coin];
    if (!exchange || !m || busy) return;
    setBusy(p.coin);
    const id = push({ title: `Close ${p.coin} ${p.side}`, state: "submitted" });
    try {
      const legs = await closePosition(exchange, { market: m, szi: p.szi, fraction: 1, type: "market", refPx: m.ctx?.midPx ?? m.ctx?.markPx ?? 0, slippage });
      reportClose(id, legs, update);
    } catch (e) {
      logError("close", e);
      update(id, { state: "failed", detail: humanizeError(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-panel"><tr>
          {["Market", "Size", "Value", "Entry", "Mark", "PnL (ROE)", "Liq. price", "Margin", "TP / SL", "Funding", ""].map((h) => <th key={h} className={th}>{h}</th>)}
        </tr></thead>
        <tbody>
          {positions.map((p) => {
            const m = markets[p.coin];
            const sz = m?.szDecimals ?? 4;
            const mark = m?.ctx?.markPx ?? null;
            const coinOrders = orders.filter((o) => o.coin === p.coin && o.isTrigger && o.reduceOnly);
            const tp = coinOrders.find((o) => o.orderType.startsWith("Take Profit"));
            const sl = coinOrders.find((o) => o.orderType.startsWith("Stop"));
            const nearLiq = p.liqPx && mark ? Math.abs(mark - p.liqPx) / mark < 0.05 : false;
            return (
              <tr key={p.coin} className="border-t border-line hover:bg-panel-2">
                <td className={td}>
                  <Link href={coinToPath(p.coin)} className="flex items-center gap-1.5">
                    <span className={clsx("w-0.5 h-4 rounded", p.side === "long" ? "bg-long" : "bg-short")} />
                    <span className="font-medium">{m?.base ?? p.coin}</span>
                    {p.dex && <Badge>{p.dex}</Badge>}
                    <span className={clsx("text-[10px]", p.side === "long" ? "text-long" : "text-short")}>{p.leverage}x {p.side.toUpperCase()}</span>
                  </Link>
                </td>
                <td className={clsx(td, "num", p.side === "long" ? "text-long" : "text-short")}>{fmtSize(Math.abs(p.szi), sz)}</td>
                <td className={clsx(td, "num")}>{fmtUsd(p.positionValue)}</td>
                <td className={clsx(td, "num")}>{fmtPx(p.entryPx, sz)}</td>
                <td className={clsx(td, "num")}>{fmtPx(mark, sz)}</td>
                <td className={clsx(td, "num", pnlClass(p.unrealizedPnl))}>{fmtUsd(p.unrealizedPnl)} ({fmtPct(p.roe, 1)})</td>
                <td className={clsx(td, "num", nearLiq ? "text-short font-semibold" : "text-warn")}>{fmtPx(p.liqPx, sz)}{nearLiq && " ⚠"}</td>
                <td className={clsx(td, "num")}>{fmtUsd(p.marginUsed)} <span className="text-faint capitalize">{p.leverageType}</span></td>
                <td className={clsx(td, "num")}>
                  <button onClick={() => setTpslFor(p)} className="hover:text-accent">
                    {tp ? fmtPx(Number(tp.triggerPx), sz) : "--"} / {sl ? fmtPx(Number(sl.triggerPx), sz) : "--"} ✎
                  </button>
                </td>
                <td className={clsx(td, "num", pnlClass(-p.cumFunding))}>{fmtUsd(-p.cumFunding)}</td>
                <td className={clsx(td, "text-right")}>
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={!exchange || busy === p.coin} onClick={() => marketClose(p)}>
                      {busy === p.coin ? <Spinner /> : "Market close"}
                    </Button>
                    <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={!exchange} onClick={() => setClosing(p)}>Close…</Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {closing && markets[closing.coin] && <CloseModal position={closing} market={markets[closing.coin]} onClose={() => setClosing(null)} />}
      {tpslFor && markets[tpslFor.coin] && <TpslModal position={tpslFor} market={markets[tpslFor.coin]} onClose={() => setTpslFor(null)} />}
    </>
  );
}

function reportClose(id: string, legs: LegResult[], update: (id: string, t: object) => void) {
  const l = legs[0];
  update(id, {
    state: l.state,
    oid: l.oid,
    detail: l.error ? humanizeError(l.error) : l.state === "filled" || l.state === "partial" ? `Closed ${l.filledSz} @ ${l.avgPx}` : l.state === "open" ? "Close order resting" : undefined,
  });
}

function CloseModal({ position, market, onClose }: { position: PositionRow; market: Market; onClose: () => void }) {
  const { exchange } = useTrading();
  const slippage = usePrefs((s) => s.slippage);
  const [pct, setPct] = useState(100);
  const [type, setType] = useState<"market" | "limit">("market");
  const [px, setPx] = useState(market.ctx?.midPx ? roundPrice(market.ctx.midPx, market.szDecimals) : "");
  const [busy, setBusy] = useState(false);
  const size = (Math.abs(position.szi) * pct) / 100;
  const priceOk = type === "market" || isValidPrice(px, market.szDecimals);
  const estPnl = (Number(type === "limit" ? px : market.ctx?.markPx ?? 0) - position.entryPx) * size * (position.side === "long" ? 1 : -1);

  const submit = async () => {
    if (!exchange || busy) return;
    setBusy(true);
    const { push, update } = useToasts.getState();
    const id = push({ title: `Close ${pct}% of ${market.base} ${position.side}`, state: "submitted" });
    try {
      const legs = await closePosition(exchange, {
        market, szi: position.szi, fraction: pct / 100, type, limitPx: Number(px), refPx: market.ctx?.midPx ?? market.ctx?.markPx ?? 0, slippage,
      });
      reportClose(id, legs, update);
      onClose();
    } catch (e) {
      logError("partial close", e);
      update(id, { state: "failed", detail: humanizeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Close ${market.base} ${position.side}`}>
      <div className="flex flex-col gap-3 text-xs">
        <div className="grid grid-cols-2 gap-1">
          {(["market", "limit"] as const).map((t) => (
            <button key={t} onClick={() => setType(t)} className={clsx("py-1.5 rounded capitalize", type === t ? "bg-raised text-fg" : "text-muted")}>{t}</button>
          ))}
        </div>
        {type === "limit" && (
          <label className="flex items-center gap-2 rounded border border-line-2 bg-panel px-2.5 py-2">
            <span className="text-faint">Price</span>
            <input value={px} onChange={(e) => setPx(e.target.value.replace(/[^0-9.]/g, ""))} className="num flex-1 bg-transparent outline-none" />
          </label>
        )}
        <div>
          <div className="flex justify-between mb-1"><span className="text-muted">Amount</span><span className="num">{fmtSize(size, market.szDecimals)} {market.base} ({pct}%)</span></div>
          <input type="range" min={1} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full" />
          <div className="grid grid-cols-4 gap-1 mt-2">{[25, 50, 75, 100].map((p) => <button key={p} onClick={() => setPct(p)} className="bg-raised rounded py-1 text-muted hover:text-fg">{p}%</button>)}</div>
        </div>
        <div className="flex justify-between"><span className="text-muted">Est. realized PnL (before fees)</span><span className={clsx("num", pnlClass(estPnl))}>{fmtUsd(estPnl)}</span></div>
        {!priceOk && <p className="text-short">Invalid price precision for this market.</p>}
        <Button variant="accent" onClick={submit} disabled={busy || !priceOk || size <= 0}>{busy ? "Submitting…" : "Confirm close (reduce-only)"}</Button>
      </div>
    </Modal>
  );
}

function TpslModal({ position, market, onClose }: { position: PositionRow; market: Market; onClose: () => void }) {
  const { exchange } = useTrading();
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [busy, setBusy] = useState(false);
  const s = position.side === "long" ? 1 : -1;
  const mark = market.ctx?.markPx ?? position.entryPx;
  const errs: string[] = [];
  if (tp && (!isValidPrice(tp, market.szDecimals) || (Number(tp) - mark) * s <= 0)) errs.push(`Take-profit must be a valid price ${s > 0 ? "above" : "below"} the mark.`);
  if (sl && (!isValidPrice(sl, market.szDecimals) || (Number(sl) - mark) * s >= 0)) errs.push(`Stop-loss must be a valid price ${s > 0 ? "below" : "above"} the mark.`);
  if (sl && position.liqPx && (Number(sl) - position.liqPx) * s <= 0) errs.push("Stop-loss is beyond your liquidation price.");

  const submit = async () => {
    if (!exchange || busy || errs.length || (!tp && !sl)) return;
    setBusy(true);
    const { push, update } = useToasts.getState();
    const id = push({ title: `Set TP/SL on ${market.base}`, state: "submitted" });
    try {
      const legs = await setPositionTpsl(exchange, { market, szi: position.szi, tpPx: Number(tp) || undefined, slPx: Number(sl) || undefined });
      const bad = legs.find((l) => l.state === "rejected" || l.state === "failed");
      update(id, { state: bad ? "rejected" : "success", detail: legs.map((l) => `${l.label}: ${l.state}${l.error ? " (" + humanizeError(l.error) + ")" : ""}`).join(" · ") });
      if (!bad) onClose();
    } catch (e) {
      logError("tpsl", e);
      update(id, { state: "failed", detail: humanizeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`TP / SL: ${market.base} ${position.side}`}>
      <div className="flex flex-col gap-3 text-xs">
        <div className="flex justify-between text-muted"><span>Entry / Mark</span><span className="num text-fg">{fmtPx(position.entryPx, market.szDecimals)} / {fmtPx(mark, market.szDecimals)}</span></div>
        {[["Take profit", tp, setTp], ["Stop loss", sl, setSl]].map(([label, v, set]) => (
          <label key={label as string} className="flex items-center gap-2 rounded border border-line-2 bg-panel px-2.5 py-2">
            <span className="text-faint w-20">{label as string}</span>
            <input value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Trigger price" className="num flex-1 bg-transparent outline-none" />
          </label>
        ))}
        <p className="text-faint">Triggers execute as reduce-only market orders for the full position size. Existing TP/SL orders can be cancelled from Open Orders.</p>
        {errs.map((e) => <p key={e} className="text-short">{e}</p>)}
        <Button variant="accent" onClick={submit} disabled={busy || errs.length > 0 || (!tp && !sl)}>{busy ? "Submitting…" : "Confirm"}</Button>
      </div>
    </Modal>
  );
}

export function OrdersTable({ orders }: { orders: OpenOrderRow[] }) {
  const markets = useMarkets((s) => s.markets);
  const { exchange } = useTrading();
  const [busy, setBusy] = useState<number | null>(null);
  if (!orders.length) return <Empty>No open orders.</Empty>;

  const cancel = async (o: OpenOrderRow) => {
    const m = markets[o.coin];
    if (!exchange || !m) return;
    setBusy(o.oid);
    const { push, update } = useToasts.getState();
    const id = push({ title: `Cancel ${o.coin} order #${o.oid}`, state: "submitted" });
    try {
      await cancelOrder(exchange, m.assetId, o.oid);
      update(id, { state: "cancelled" });
      useAccountStore.getState().set({ openOrders: useAccountStore.getState().openOrders.filter((x) => x.oid !== o.oid) });
    } catch (e) {
      logError("cancel", e);
      update(id, { state: "rejected", detail: humanizeError(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-panel"><tr>
        {["Time", "Market", "Type", "Side", "Price", "Trigger", "Size", "Filled", "Reduce", ""].map((h) => <th key={h} className={th}>{h}</th>)}
      </tr></thead>
      <tbody>
        {orders.map((o) => {
          const m = markets[o.coin];
          const sz = m?.szDecimals ?? 4;
          return (
            <tr key={o.oid} className="border-t border-line hover:bg-panel-2">
              <td className={clsx(td, "text-muted")}>{fmtDateTime(o.timestamp)}</td>
              <td className={td}>{m?.base ?? o.coin} {o.dex && <Badge>{o.dex}</Badge>}</td>
              <td className={td}>{o.orderType}{o.tif ? <span className="text-faint"> {o.tif}</span> : null}</td>
              <td className={clsx(td, o.side === "B" ? "text-long" : "text-short")}>{o.side === "B" ? "Buy" : "Sell"}</td>
              <td className={clsx(td, "num")}>{o.isTrigger && o.orderType.includes("Market") ? "Market" : fmtPx(Number(o.limitPx), sz)}</td>
              <td className={clsx(td, "num")}>{o.isTrigger ? `${o.triggerCondition}` : "--"}</td>
              <td className={clsx(td, "num")}>{fmtSize(Number(o.origSz), sz)}</td>
              <td className={clsx(td, "num")}>{fmtSize(Number(o.origSz) - Number(o.sz), sz)}</td>
              <td className={td}>{o.reduceOnly ? "Yes" : "No"}</td>
              <td className={clsx(td, "text-right")}>
                <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={!exchange || busy === o.oid} onClick={() => cancel(o)}>
                  {busy === o.oid ? <Spinner /> : "Cancel"}
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function FillsTable({ fills }: { fills: ReturnType<typeof useAccountStore.getState>["fills"] }) {
  const markets = useMarkets((s) => s.markets);
  if (!fills.length) return <Empty>No trades yet.</Empty>;
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-panel"><tr>
        {["Time", "Market", "Direction", "Price", "Size", "Value", "Fee", "Closed PnL"].map((h) => <th key={h} className={th}>{h}</th>)}
      </tr></thead>
      <tbody>
        {fills.map((f) => {
          const m = markets[f.coin];
          const sz = m?.szDecimals ?? 4;
          const fee = Number((f as { fee?: string }).fee ?? 0);
          const pnl = Number(f.closedPnl);
          return (
            <tr key={`${f.hash}-${f.oid}-${f.time}-${f.sz}`} className="border-t border-line hover:bg-panel-2">
              <td className={clsx(td, "text-muted")}>{fmtDateTime(f.time)}</td>
              <td className={td}>{m?.base ?? f.coin}{m?.dex ? <> <Badge>{m.dex}</Badge></> : null}</td>
              <td className={clsx(td, f.side === "B" ? "text-long" : "text-short")}>{f.dir}{"liquidation" in f && f.liquidation ? " (liquidation)" : ""}</td>
              <td className={clsx(td, "num")}>{fmtPx(Number(f.px), sz)}</td>
              <td className={clsx(td, "num")}>{fmtSize(Number(f.sz), sz)}</td>
              <td className={clsx(td, "num")}>{fmtUsd(Number(f.px) * Number(f.sz))}</td>
              <td className={clsx(td, "num text-muted")}>{fmtUsd(fee, 4)}</td>
              <td className={clsx(td, "num", pnlClass(pnl))}>{pnl ? fmtUsd(pnl) : "--"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function useFunding(days = 7) {
  const { address } = useConnection();
  const [rows, setRows] = useState<UserFundingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setRows(null);
    if (!address) return;
    getInfo()
      .userFunding({ user: address, startTime: Date.now() - days * 86400_000 })
      .then((r) => setRows([...r].sort((a, b) => b.time - a.time)))
      .catch((e) => { logError("userFunding", e); setError(humanizeError(e)); });
  }, [address, days]);
  return { rows, error };
}

export function FundingTable({ coin }: { coin?: string }) {
  const { rows, error } = useFunding(7);
  const list = useMemo(() => (rows ?? []).filter((r) => !coin || r.delta.coin === coin), [rows, coin]);
  if (error) return <Empty>{error}</Empty>;
  if (!rows) return <div className="grid place-items-center py-8"><Spinner /></div>;
  if (!list.length) return <Empty>No funding payments in the last 7 days.</Empty>;
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-panel"><tr>
        {["Time", "Market", "Position", "Rate", "Payment"].map((h) => <th key={h} className={th}>{h}</th>)}
      </tr></thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.hash + r.delta.coin + r.time} className="border-t border-line">
            <td className={clsx(td, "text-muted")}>{fmtDateTime(r.time)}</td>
            <td className={td}>{r.delta.coin}</td>
            <td className={clsx(td, "num", Number(r.delta.szi) > 0 ? "text-long" : "text-short")}>{r.delta.szi}</td>
            <td className={clsx(td, "num")}>{(Number(r.delta.fundingRate) * 100).toFixed(4)}%</td>
            <td className={clsx(td, "num", pnlClass(Number(r.delta.usdc)))}>{fmtUsd(Number(r.delta.usdc), 4)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
