"use client";
import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useFundingFeeHistory, useOrderStream, usePositionClose, usePositionStream, usePrivateQuery, useTPSLOrder,
} from "@orderly.network/hooks";
import { OrderStatus, OrderType, PositionType, type API } from "@orderly.network/types";
import { Badge, Button, Empty, Modal, Spinner, Tabs } from "@/components/ui/primitives";
import { fmtDateTime, fmtPct, fmtPx, fmtSize, fmtUsd, marketPath, pnlClass } from "@/lib/format";
import { humanizeError, logError } from "@/lib/errors";
import { useAccountStage } from "@/lib/orderly/account";
import type { Market } from "@/lib/orderly/markets";
import { useMarkets } from "@/store/markets";
import { useToasts } from "@/store/toasts";

type Tab = "positions" | "orders" | "history" | "funding";
type Position = API.PositionTPSLExt;

export function AccountTabs({ className, filterSymbol }: { className?: string; filterSymbol?: string }) {
  const { stage } = useAccountStage();
  const [tab, setTab] = useState<Tab>("positions");
  const [onlyThis, setOnlyThis] = useState(false);
  const symbol = onlyThis ? filterSymbol : undefined;
  const ready = stage === "ready";
  const [{ rows }] = usePositionStream();
  const [orders] = useOrderStream({ status: OrderStatus.INCOMPLETE, size: 100 }, { enabled: ready });
  const positions = (rows ?? []).filter((p) => p.position_qty !== 0 && (!symbol || p.symbol === symbol));
  const openOrders = ((orders ?? []) as OrderRow[]).filter((o) => !symbol || o.symbol === symbol);

  return (
    <div className={clsx("panel flex flex-col min-h-0", className)}>
      <div className="flex items-center border-b border-line pr-2">
        <Tabs value={tab} onChange={setTab} className="flex-1 px-1" items={[
          { value: "positions", label: `Positions (${ready ? positions.length : 0})` },
          { value: "orders", label: `Open Orders (${ready ? openOrders.length : 0})` },
          { value: "history", label: "Trade History" },
          { value: "funding", label: "Funding" },
        ]} />
        {filterSymbol && (
          <label className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap">
            <input type="checkbox" checked={onlyThis} onChange={(e) => setOnlyThis(e.target.checked)} className="accent-[#18d98b]" /> This market only
          </label>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto scroll-thin">
        {stage === "unavailable" ? (
          <Empty>Trading opens soon. Positions, orders and history will show here.</Empty>
        ) : stage === "disconnected" ? (
          <Empty>Connect a wallet to see your positions, orders and history.</Empty>
        ) : stage === "checking" ? (
          <div className="grid place-items-center py-8"><Spinner /></div>
        ) : !ready ? (
          <Empty>Finish account setup to see your positions, orders and history.</Empty>
        ) : tab === "positions" ? (
          <PositionsTable positions={positions} />
        ) : tab === "orders" ? (
          <OrdersTable orders={openOrders} />
        ) : tab === "history" ? (
          <TradesTable symbol={symbol} />
        ) : (
          <FundingTable symbol={symbol} />
        )}
      </div>
    </div>
  );
}

const th = "px-3 py-2 text-left font-normal text-faint whitespace-nowrap";
const td = "px-3 py-1.5 whitespace-nowrap";

function MarketCell({ symbol, children }: { symbol: string; children?: React.ReactNode }) {
  const m = useMarkets((s) => s.markets[symbol]);
  return (
    <Link href={m ? marketPath(m.slug) : "#"} className="flex items-center gap-1.5">
      {children}
      <span className="font-medium">{m?.base ?? symbol}</span>
      {m?.builder && <Badge>{m.builder}</Badge>}
    </Link>
  );
}

export function PositionsTable({ positions }: { positions: Position[] }) {
  const markets = useMarkets((s) => s.markets);
  const [closing, setClosing] = useState<Position | null>(null);
  const [tpslFor, setTpslFor] = useState<Position | null>(null);
  if (!positions.length) return <Empty>No open positions.</Empty>;

  return (
    <>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-panel"><tr>
          {["Market", "Size", "Value", "Entry", "Mark", "Unrealized PnL", "Liq. price", "Margin", "TP / SL", ""].map((h) => <th key={h} className={th}>{h}</th>)}
        </tr></thead>
        <tbody>
          {positions.map((p) => {
            const m = markets[p.symbol];
            const pxd = m?.pxDecimals ?? 2;
            const szd = m?.szDecimals ?? 4;
            const long = p.position_qty > 0;
            const liq = p.est_liq_price && p.est_liq_price > 0 ? p.est_liq_price : null;
            const nearLiq = liq && p.mark_price ? Math.abs(p.mark_price - liq) / p.mark_price < 0.05 : false;
            const tp = p.full_tp_sl?.tp_trigger_price;
            const sl = p.full_tp_sl?.sl_trigger_price;
            return (
              <tr key={`${p.symbol}:${p.margin_mode ?? ""}`} className="border-t border-line hover:bg-panel-2">
                <td className={td}>
                  <MarketCell symbol={p.symbol}>
                    <span className={clsx("w-0.5 h-4 rounded", long ? "bg-long" : "bg-short")} />
                  </MarketCell>
                  <span className={clsx("text-[10px]", long ? "text-long" : "text-short")}>{p.leverage}x {long ? "LONG" : "SHORT"} · {(p.margin_mode ?? "CROSS").toLowerCase()}</span>
                </td>
                <td className={clsx(td, "num", long ? "text-long" : "text-short")}>{fmtSize(Math.abs(p.position_qty), szd)}</td>
                <td className={clsx(td, "num")}>{fmtUsd(p.notional)}</td>
                <td className={clsx(td, "num")}>{fmtPx(p.average_open_price, pxd)}</td>
                <td className={clsx(td, "num")}>{fmtPx(p.mark_price, pxd)}</td>
                <td className={clsx(td, "num", pnlClass(p.unrealized_pnl))}>{fmtUsd(p.unrealized_pnl)} ({fmtPct(p.unrealized_pnl_ROI, 1)})</td>
                <td className={clsx(td, "num", nearLiq ? "text-short font-semibold" : "text-warn")}>{fmtPx(liq, pxd)}{nearLiq && " ⚠"}</td>
                <td className={clsx(td, "num")}>{p.margin != null ? fmtUsd(p.margin) : fmtUsd(Math.abs(p.notional) / (p.leverage || 1))}</td>
                <td className={clsx(td, "num")}>
                  <button onClick={() => setTpslFor(p)} className="hover:text-accent" disabled={!m}>
                    {tp ? fmtPx(tp, pxd) : "--"} / {sl ? fmtPx(sl, pxd) : "--"} ✎
                  </button>
                </td>
                <td className={clsx(td, "text-right")}>
                  <div className="flex gap-1 justify-end">
                    {m && <MarketCloseButton position={p} market={m} />}
                    <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={!m} onClick={() => setClosing(p)}>Close…</Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {closing && markets[closing.symbol] && <CloseModal position={closing} market={markets[closing.symbol]} onClose={() => setClosing(null)} />}
      {tpslFor && markets[tpslFor.symbol] && <TpslModal position={tpslFor} market={markets[tpslFor.symbol]} onClose={() => setTpslFor(null)} />}
    </>
  );
}

function stepDown(v: number, step: number, dec: number) {
  return (Math.floor(v / step + 1e-9) * step).toFixed(dec);
}

function MarketCloseButton({ position, market }: { position: Position; market: Market }) {
  const qty = stepDown(Math.abs(position.position_qty), market.baseTick, market.szDecimals);
  const { submit, isMutating } = usePositionClose({ position, order: { type: OrderType.MARKET, quantity: qty, price: "" } });
  const close = async () => {
    const { push, update } = useToasts.getState();
    const id = push({ title: `Close ${market.base} ${position.position_qty > 0 ? "long" : "short"}`, state: "pending", detail: "Sending reduce-only market order…" });
    try {
      await submit();
      update(id, { state: "submitted", detail: "Close order sent" });
    } catch (e) {
      logError("market close", e);
      update(id, { state: "failed", detail: humanizeError(e) });
    }
  };
  return (
    <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={isMutating} onClick={close}>
      {isMutating ? <Spinner /> : "Market close"}
    </Button>
  );
}

function CloseModal({ position, market, onClose }: { position: Position; market: Market; onClose: () => void }) {
  const [pct, setPct] = useState(100);
  const [type, setType] = useState<"market" | "limit">("market");
  const [px, setPx] = useState(position.mark_price ? position.mark_price.toFixed(market.pxDecimals) : "");
  const abs = Math.abs(position.position_qty);
  const qty = stepDown((abs * pct) / 100, market.baseTick, market.szDecimals);
  const { submit, isMutating, errors } = usePositionClose({
    position,
    order: { type: type === "market" ? OrderType.MARKET : OrderType.LIMIT, quantity: qty, price: type === "limit" ? px : "" },
  });
  const refPx = type === "limit" ? Number(px) : position.mark_price;
  const estPnl = (refPx - position.average_open_price) * Number(qty) * (position.position_qty > 0 ? 1 : -1);
  const errMsgs = Object.values(errors ?? {}).map((e) => e?.message).filter(Boolean) as string[];

  const go = async () => {
    const { push, update } = useToasts.getState();
    const id = push({ title: `Close ${pct}% of ${market.base}`, state: "pending", detail: "Sending reduce-only order…" });
    try {
      await submit();
      update(id, { state: "submitted", detail: type === "limit" ? "Close order placed" : "Close order sent" });
      onClose();
    } catch (e) {
      logError("partial close", e);
      update(id, { state: "failed", detail: humanizeError(e) });
    }
  };

  return (
    <Modal open onClose={onClose} title={`Close ${market.base} ${position.position_qty > 0 ? "long" : "short"}`}>
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
          <div className="flex justify-between mb-1"><span className="text-muted">Amount</span><span className="num">{fmtSize(Number(qty), market.szDecimals)} {market.base} ({pct}%)</span></div>
          <input type="range" min={1} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full" />
          <div className="grid grid-cols-4 gap-1 mt-2">{[25, 50, 75, 100].map((p) => <button key={p} onClick={() => setPct(p)} className="bg-raised rounded py-1 text-muted hover:text-fg">{p}%</button>)}</div>
        </div>
        <div className="flex justify-between"><span className="text-muted">Est. realized PnL (before fees)</span><span className={clsx("num", pnlClass(estPnl))}>{Number.isFinite(estPnl) ? fmtUsd(estPnl) : "--"}</span></div>
        {errMsgs.map((e) => <p key={e} className="text-short">{e}</p>)}
        <Button variant="accent" onClick={go} disabled={isMutating || !(Number(qty) > 0) || (type === "limit" && !(Number(px) > 0))}>
          {isMutating ? "Submitting…" : "Confirm close (reduce-only)"}
        </Button>
      </div>
    </Modal>
  );
}

function TpslModal({ position, market, onClose }: { position: Position; market: Market; onClose: () => void }) {
  const existing = position.full_tp_sl?.algo_order;
  const [order, { setValue, submit, errors, isCreateMutating, isUpdateMutating }] = useTPSLOrder(position, {
    positionType: PositionType.FULL,
    defaultOrder: existing,
    isEditing: !!existing,
  });
  const busy = isCreateMutating || isUpdateMutating;
  const errMsgs = Object.values(errors ?? {}).map((e) => e?.message).filter(Boolean) as string[];
  const long = position.position_qty > 0;

  const go = async () => {
    const { push, update } = useToasts.getState();
    const id = push({ title: `Set TP/SL on ${market.base}`, state: "pending" });
    try {
      await submit();
      update(id, { state: "success", detail: "TP/SL saved" });
      onClose();
    } catch (e) {
      logError("tpsl", e);
      const msg = e && typeof e === "object" && !(e instanceof Error)
        ? Object.values(e as Record<string, { message?: string }>).map((v) => v?.message).filter(Boolean).join(" · ")
        : humanizeError(e);
      update(id, { state: "failed", detail: msg || humanizeError(e) });
    }
  };

  return (
    <Modal open onClose={onClose} title={`TP / SL: ${market.base} ${long ? "long" : "short"}`}>
      <div className="flex flex-col gap-3 text-xs">
        <div className="flex justify-between text-muted"><span>Entry / Mark</span><span className="num text-fg">{fmtPx(position.average_open_price, market.pxDecimals)} / {fmtPx(position.mark_price, market.pxDecimals)}</span></div>
        <label className="flex items-center gap-2 rounded border border-line-2 bg-panel px-2.5 py-2">
          <span className="text-faint w-20">Take profit</span>
          <input defaultValue={order.tp_trigger_price ?? ""} onChange={(e) => setValue("tp_trigger_price", e.target.value.replace(/[^0-9.]/g, ""))} placeholder={`Trigger ${long ? "above" : "below"} mark`} className="num flex-1 bg-transparent outline-none" />
        </label>
        <label className="flex items-center gap-2 rounded border border-line-2 bg-panel px-2.5 py-2">
          <span className="text-faint w-20">Stop loss</span>
          <input defaultValue={order.sl_trigger_price ?? ""} onChange={(e) => setValue("sl_trigger_price", e.target.value.replace(/[^0-9.]/g, ""))} placeholder={`Trigger ${long ? "below" : "above"} mark`} className="num flex-1 bg-transparent outline-none" />
        </label>
        <div className="flex justify-between text-faint">
          <span>Est. TP PnL <span className={clsx("num", pnlClass(Number(order.tp_pnl)))}>{order.tp_pnl != null ? fmtUsd(Number(order.tp_pnl)) : "--"}</span></span>
          <span>Est. SL PnL <span className={clsx("num", pnlClass(Number(order.sl_pnl)))}>{order.sl_pnl != null ? fmtUsd(Number(order.sl_pnl)) : "--"}</span></span>
        </div>
        <p className="text-faint">Triggers on the mark price and closes the whole position with a reduce-only market order.</p>
        {errMsgs.map((e) => <p key={e} className="text-short">{e}</p>)}
        <Button variant="accent" onClick={go} disabled={busy}>{busy ? "Submitting…" : "Confirm"}</Button>
      </div>
    </Modal>
  );
}

interface OrderRow {
  symbol: string;
  side: string;
  type?: string;
  algo_type?: string;
  order_id?: number;
  algo_order_id?: number;
  price?: number | null;
  quantity?: number;
  total_executed_quantity?: number;
  executed?: number;
  trigger_price?: number;
  reduce_only?: boolean;
  created_time: number;
  child_orders?: { algo_type?: string; trigger_price?: number; is_activated?: boolean }[];
}

function orderLabel(o: OrderRow) {
  if (o.algo_type === "POSITIONAL_TP_SL" || o.algo_type === "TP_SL") return "TP / SL";
  if (o.algo_type === "STOP") return `Stop ${o.type === "MARKET" ? "market" : "limit"}`;
  if (o.algo_type) return o.algo_type.replace(/_/g, " ").toLowerCase();
  return (o.type ?? "").replace(/_/g, " ").toLowerCase();
}

function triggerText(o: OrderRow, pxd: number) {
  if (o.child_orders?.length) {
    const tp = o.child_orders.find((c) => c.algo_type === "TAKE_PROFIT" && c.trigger_price);
    const sl = o.child_orders.find((c) => c.algo_type === "STOP_LOSS" && c.trigger_price);
    return `${tp ? "TP " + fmtPx(tp.trigger_price, pxd) : ""}${tp && sl ? " · " : ""}${sl ? "SL " + fmtPx(sl.trigger_price, pxd) : ""}` || "--";
  }
  return o.trigger_price ? fmtPx(o.trigger_price, pxd) : "--";
}

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const markets = useMarkets((s) => s.markets);
  const [, { cancelOrder, cancelAlgoOrder }] = useOrderStream({ status: OrderStatus.INCOMPLETE, size: 100 });
  const [busy, setBusy] = useState<string | null>(null);
  if (!orders.length) return <Empty>No open orders.</Empty>;

  const cancel = async (o: OrderRow) => {
    const key = String(o.algo_order_id ?? o.order_id);
    setBusy(key);
    const { push, update } = useToasts.getState();
    const id = push({ title: `Cancel ${markets[o.symbol]?.base ?? o.symbol} ${orderLabel(o)}`, state: "pending" });
    try {
      if (o.algo_order_id) await cancelAlgoOrder(o.algo_order_id, o.symbol);
      else if (o.order_id) await cancelOrder(o.order_id, o.symbol);
      update(id, { state: "cancelled" });
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
          const m = markets[o.symbol];
          const pxd = m?.pxDecimals ?? 2;
          const szd = m?.szDecimals ?? 4;
          const key = String(o.algo_order_id ?? o.order_id);
          const filled = o.total_executed_quantity ?? o.executed ?? 0;
          return (
            <tr key={key} className="border-t border-line hover:bg-panel-2">
              <td className={clsx(td, "text-muted")}>{fmtDateTime(o.created_time)}</td>
              <td className={td}><MarketCell symbol={o.symbol} /></td>
              <td className={clsx(td, "capitalize")}>{orderLabel(o)}</td>
              <td className={clsx(td, o.side === "BUY" ? "text-long" : "text-short")}>{o.side === "BUY" ? "Buy" : "Sell"}</td>
              <td className={clsx(td, "num")}>{o.price ? fmtPx(o.price, pxd) : "Market"}</td>
              <td className={clsx(td, "num")}>{triggerText(o, pxd)}</td>
              <td className={clsx(td, "num")}>{o.quantity ? fmtSize(o.quantity, szd) : "Position"}</td>
              <td className={clsx(td, "num")}>{fmtSize(filled, szd)}</td>
              <td className={td}>{o.reduce_only ? "Yes" : "No"}</td>
              <td className={clsx(td, "text-right")}>
                <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={busy === key} onClick={() => cancel(o)}>
                  {busy === key ? <Spinner /> : "Cancel"}
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface TradeRow {
  id: number;
  symbol: string;
  side: string;
  executed_price: number;
  executed_quantity: number;
  executed_timestamp: number;
  fee: number;
  fee_asset?: string;
  is_maker?: number | boolean;
  realized_pnl?: number | null;
  order_id?: number;
}

export function TradesTable({ symbol, limit = 100 }: { symbol?: string; limit?: number }) {
  const markets = useMarkets((s) => s.markets);
  const qs = new URLSearchParams({ size: String(limit), ...(symbol ? { symbol } : {}) });
  const { data, isLoading, error } = usePrivateQuery<TradeRow[]>(`/v1/trades?${qs}`, { revalidateOnFocus: false, refreshInterval: 15_000 });
  const rows = useMemo(() => [...(data ?? [])].sort((a, b) => b.executed_timestamp - a.executed_timestamp), [data]);
  if (error) return <Empty>{humanizeError(error)}</Empty>;
  if (isLoading && !data) return <div className="grid place-items-center py-8"><Spinner /></div>;
  if (!rows.length) return <Empty>No trades yet.</Empty>;
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-panel"><tr>
        {["Time", "Market", "Side", "Price", "Size", "Value", "Fee", "Realized PnL"].map((h) => <th key={h} className={th}>{h}</th>)}
      </tr></thead>
      <tbody>
        {rows.map((f) => {
          const m = markets[f.symbol];
          const pxd = m?.pxDecimals ?? 2;
          const szd = m?.szDecimals ?? 4;
          const pnl = f.realized_pnl == null ? null : Number(f.realized_pnl);
          return (
            <tr key={f.id} className="border-t border-line hover:bg-panel-2">
              <td className={clsx(td, "text-muted")}>{fmtDateTime(f.executed_timestamp)}</td>
              <td className={td}><MarketCell symbol={f.symbol} /></td>
              <td className={clsx(td, f.side === "BUY" ? "text-long" : "text-short")}>{f.side === "BUY" ? "Buy" : "Sell"}{f.is_maker ? <span className="text-faint"> maker</span> : null}</td>
              <td className={clsx(td, "num")}>{fmtPx(f.executed_price, pxd)}</td>
              <td className={clsx(td, "num")}>{fmtSize(f.executed_quantity, szd)}</td>
              <td className={clsx(td, "num")}>{fmtUsd(f.executed_price * f.executed_quantity)}</td>
              <td className={clsx(td, "num text-muted")}>{fmtUsd(Number(f.fee), 4)}</td>
              <td className={clsx(td, "num", pnlClass(pnl))}>{pnl ? fmtUsd(pnl) : "--"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function FundingTable({ symbol }: { symbol?: string }) {
  const markets = useMarkets((s) => s.markets);
  const [rows, { isLoading }] = useFundingFeeHistory({ symbol, page: 1, pageSize: 100 });
  const list = useMemo(() => [...(rows ?? [])].sort((a, b) => b.created_time - a.created_time), [rows]);
  if (isLoading && !rows) return <div className="grid place-items-center py-8"><Spinner /></div>;
  if (!list.length) return <Empty>No funding payments yet.</Empty>;
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-panel"><tr>
        {["Time", "Market", "Rate", "Mark", "Payment"].map((h) => <th key={h} className={th}>{h}</th>)}
      </tr></thead>
      <tbody>
        {list.map((r, i) => {
          const m = markets[r.symbol];
          // funding_fee is what the account paid; show it from the user's side (received = positive)
          const pay = -Number(r.funding_fee);
          return (
            <tr key={`${r.symbol}-${r.created_time}-${i}`} className="border-t border-line">
              <td className={clsx(td, "text-muted")}>{fmtDateTime(r.created_time)}</td>
              <td className={td}><MarketCell symbol={r.symbol} /></td>
              <td className={clsx(td, "num")}>{(Number(r.funding_rate) * 100).toFixed(4)}%</td>
              <td className={clsx(td, "num")}>{fmtPx(r.mark_price, m?.pxDecimals ?? 2)}</td>
              <td className={clsx(td, "num", pnlClass(pay))}>{fmtUsd(pay, 4)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
