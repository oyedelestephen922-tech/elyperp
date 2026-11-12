"use client";
import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, Empty, Modal, Spinner, Tabs } from "@/components/ui/primitives";
import { fmtDateTime, fmtPct, fmtPx, fmtSize, fmtUsd, marketPath, pnlClass, toMs } from "@/lib/format";
import { humanizeError, logError } from "@/lib/errors";
import { useAccountStage, useSession } from "@/lib/lighter/session";
import { cancelOrder, closePosition, getAuth, setPositionTpsl } from "@/lib/lighter/actions";
import { fetchAccountTrades, fetchFundingHistory, type RawFunding, type RawOrder, type RawTrade } from "@/lib/lighter/api";
import { isTrigger, orderLabel, useOpenOrders, usePositions, type Position } from "@/lib/lighter/positions";
import type { Market } from "@/lib/lighter/markets";
import { useMarkets, usePrefs } from "@/store/markets";
import { useToasts } from "@/store/toasts";

type Tab = "positions" | "orders" | "history" | "funding";

export function AccountTabs({ className, filterMarketId }: { className?: string; filterMarketId?: number }) {
  const { stage } = useAccountStage();
  const [tab, setTab] = useState<Tab>("positions");
  const [onlyThis, setOnlyThis] = useState(false);
  const marketId = onlyThis ? filterMarketId : undefined;
  const hasAccount = stage === "ready" || stage === "no_key";
  const positions = usePositions(marketId);
  const orders = useOpenOrders(marketId);
  const ready = stage === "ready";

  return (
    <div className={clsx("panel flex flex-col min-h-0", className)}>
      <div className="flex items-center border-b border-line pr-2">
        <Tabs value={tab} onChange={setTab} className="flex-1 px-1" items={[
          { value: "positions", label: `Positions (${hasAccount ? positions.length : 0})` },
          { value: "orders", label: `Open Orders (${ready ? orders.length : 0})` },
          { value: "history", label: "Trade History" },
          { value: "funding", label: "Funding" },
        ]} />
        {filterMarketId != null && (
          <label className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap">
            <input type="checkbox" checked={onlyThis} onChange={(e) => setOnlyThis(e.target.checked)} className="accent-[#18d98b]" /> This market only
          </label>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto scroll-thin">
        {stage === "disconnected" ? (
          <Empty>Connect a wallet to see your positions, orders and history.</Empty>
        ) : stage === "checking" ? (
          <div className="grid place-items-center py-8"><Spinner /></div>
        ) : stage === "no_account" ? (
          <Empty>No Lighter account for this wallet yet. Deposit USDG to open one.</Empty>
        ) : tab === "positions" ? (
          <PositionsTable positions={positions} canTrade={ready} />
        ) : !ready ? (
          <Empty>Enable trading in this browser to see orders and history.</Empty>
        ) : tab === "orders" ? (
          <OrdersTable orders={orders} />
        ) : tab === "history" ? (
          <TradesTable marketId={marketId} />
        ) : (
          <FundingTable marketId={marketId} />
        )}
      </div>
    </div>
  );
}

const th = "px-3 py-2 text-left font-normal text-faint whitespace-nowrap";
const td = "px-3 py-1.5 whitespace-nowrap";

function useMarketFor(id: number): Market | undefined {
  return useMarkets((s) => s.markets[s.byId[id]]);
}

function MarketCell({ marketId, children }: { marketId: number; children?: React.ReactNode }) {
  const m = useMarketFor(marketId);
  return (
    <Link href={m ? marketPath(m.slug) : "#"} className="flex items-center gap-1.5">
      {children}
      <span className="font-medium">{m?.base ?? `#${marketId}`}</span>
    </Link>
  );
}

export function PositionsTable({ positions, canTrade }: { positions: Position[]; canTrade: boolean }) {
  const markets = useMarkets((s) => s.markets);
  const byId = useMarkets((s) => s.byId);
  const orders = useOpenOrders();
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
            const m = markets[byId[p.marketId]];
            const pxd = m?.pxDecimals ?? 2;
            const szd = m?.szDecimals ?? 4;
            const long = p.qty > 0;
            const mark = m?.ctx?.markPx ?? 0;
            const nearLiq = p.liq && mark ? Math.abs(mark - p.liq) / mark < 0.05 : false;
            const exits = orders.filter((o) => o.market_index === p.marketId && o.reduce_only && isTrigger(o));
            const tp = exits.find((o) => o.type.startsWith("take-profit"));
            const sl = exits.find((o) => o.type.startsWith("stop-loss"));
            return (
              <tr key={p.marketId} className="border-t border-line hover:bg-panel-2">
                <td className={td}>
                  <MarketCell marketId={p.marketId}>
                    <span className={clsx("w-0.5 h-4 rounded", long ? "bg-long" : "bg-short")} />
                  </MarketCell>
                  <span className={clsx("text-[10px]", long ? "text-long" : "text-short")}>{p.leverage}x {long ? "LONG" : "SHORT"} · {p.isolated ? "isolated" : "cross"}</span>
                </td>
                <td className={clsx(td, "num", long ? "text-long" : "text-short")}>{fmtSize(Math.abs(p.qty), szd)}</td>
                <td className={clsx(td, "num")}>{fmtUsd(p.value)}</td>
                <td className={clsx(td, "num")}>{fmtPx(p.entry, pxd)}</td>
                <td className={clsx(td, "num")}>{fmtPx(mark || null, pxd)}</td>
                <td className={clsx(td, "num", pnlClass(p.upnl))}>{fmtUsd(p.upnl)}{p.roi != null && ` (${fmtPct(p.roi, 1)})`}</td>
                <td className={clsx(td, "num", nearLiq ? "text-short font-semibold" : "text-warn")}>{fmtPx(p.liq, pxd)}{nearLiq && " ⚠"}</td>
                <td className={clsx(td, "num")}>{fmtUsd(p.margin)}</td>
                <td className={clsx(td, "num")}>
                  <button onClick={() => setTpslFor(p)} className="hover:text-accent disabled:opacity-50" disabled={!m || !canTrade}>
                    {tp ? fmtPx(Number(tp.trigger_price), pxd) : "--"} / {sl ? fmtPx(Number(sl.trigger_price), pxd) : "--"} ✎
                  </button>
                </td>
                <td className={clsx(td, "text-right")}>
                  <div className="flex gap-1 justify-end">
                    {m && canTrade && <MarketCloseButton position={p} market={m} />}
                    <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={!m || !canTrade} onClick={() => setClosing(p)}>Close…</Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {closing && markets[byId[closing.marketId]] && <CloseModal position={closing} market={markets[byId[closing.marketId]]} onClose={() => setClosing(null)} />}
      {tpslFor && markets[byId[tpslFor.marketId]] && <TpslModal position={tpslFor} market={markets[byId[tpslFor.marketId]]} onClose={() => setTpslFor(null)} />}
    </>
  );
}

function stepDown(v: number, dec: number) {
  return (Math.floor(v * 10 ** dec + 1e-9) / 10 ** dec).toFixed(dec);
}

/** Price a market close crosses: the bid when selling out of a long, the ask when buying back a short. */
function closeRef(market: Market, long: boolean) {
  const c = market.ctx;
  return (long ? c?.bestBid : c?.bestAsk) || c?.markPx || 0;
}

function MarketCloseButton({ position, market }: { position: Position; market: Market }) {
  const slippage = usePrefs((s) => s.slippage);
  const [busy, setBusy] = useState(false);
  const close = async () => {
    const { push, update } = useToasts.getState();
    const long = position.qty > 0;
    const id = push({ title: `Close ${market.base} ${long ? "long" : "short"}`, state: "pending", detail: "Sending reduce-only market order…" });
    setBusy(true);
    try {
      await closePosition(market, position.side, stepDown(Math.abs(position.qty), market.szDecimals), closeRef(market, long), Math.max(slippage, 0.01));
      update(id, { state: "submitted", detail: "Close order sent" });
    } catch (e) {
      logError("market close", e);
      update(id, { state: "failed", detail: humanizeError(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={busy} onClick={close}>
      {busy ? <Spinner /> : "Market close"}
    </Button>
  );
}

function CloseModal({ position, market, onClose }: { position: Position; market: Market; onClose: () => void }) {
  const slippage = usePrefs((s) => s.slippage);
  const long = position.qty > 0;
  const [pct, setPct] = useState(100);
  const [type, setType] = useState<"market" | "limit">("market");
  const [px, setPx] = useState(market.ctx?.markPx ? market.ctx.markPx.toFixed(market.pxDecimals) : "");
  const [busy, setBusy] = useState(false);
  const abs = Math.abs(position.qty);
  const qty = stepDown((abs * pct) / 100, market.szDecimals);
  const refPx = type === "limit" ? Number(px) : market.ctx?.markPx ?? 0;
  const estPnl = (refPx - position.entry) * Number(qty) * (long ? 1 : -1);
  const tooSmall = Number(qty) > 0 && Number(qty) < market.minBase && pct < 100;

  const go = async () => {
    const { push, update } = useToasts.getState();
    const id = push({ title: `Close ${pct}% of ${market.base}`, state: "pending", detail: "Sending reduce-only order…" });
    setBusy(true);
    try {
      await closePosition(market, position.side, qty, closeRef(market, long), Math.max(slippage, 0.01), type === "limit" ? px : undefined);
      update(id, { state: "submitted", detail: type === "limit" ? "Close order placed" : "Close order sent" });
      onClose();
    } catch (e) {
      logError("partial close", e);
      update(id, { state: "failed", detail: humanizeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Close ${market.base} ${long ? "long" : "short"}`}>
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
        {tooSmall && <p className="text-short">Below this market&apos;s minimum size of {fmtSize(market.minBase, market.szDecimals)} {market.base}.</p>}
        <Button variant="accent" onClick={go} disabled={busy || !(Number(qty) > 0) || tooSmall || (type === "limit" && !(Number(px) > 0))}>
          {busy ? "Submitting…" : "Confirm close (reduce-only)"}
        </Button>
      </div>
    </Modal>
  );
}

function TpslModal({ position, market, onClose }: { position: Position; market: Market; onClose: () => void }) {
  const long = position.qty > 0;
  const mark = market.ctx?.markPx ?? 0;
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [busy, setBusy] = useState(false);
  const t = Number(tp);
  const s = Number(sl);
  const errs: string[] = [];
  if (t > 0 && mark > 0 && (long ? t <= mark : t >= mark)) errs.push(`Take profit should be ${long ? "above" : "below"} the mark price.`);
  if (s > 0 && mark > 0 && (long ? s >= mark : s <= mark)) errs.push(`Stop loss should be ${long ? "below" : "above"} the mark price.`);
  const pnl = (px: number) => (px - position.entry) * Math.abs(position.qty) * (long ? 1 : -1);

  const go = async () => {
    const { push, update } = useToasts.getState();
    const id = push({ title: `Set TP/SL on ${market.base}`, state: "pending" });
    setBusy(true);
    try {
      await setPositionTpsl(market, position.side, stepDown(Math.abs(position.qty), market.szDecimals), tp || undefined, sl || undefined);
      update(id, { state: "success", detail: "TP/SL placed. It shows in Open Orders." });
      onClose();
    } catch (e) {
      logError("tpsl", e);
      update(id, { state: "failed", detail: humanizeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`TP / SL: ${market.base} ${long ? "long" : "short"}`}>
      <div className="flex flex-col gap-3 text-xs">
        <div className="flex justify-between text-muted"><span>Entry / Mark</span><span className="num text-fg">{fmtPx(position.entry, market.pxDecimals)} / {fmtPx(mark || null, market.pxDecimals)}</span></div>
        <label className="flex items-center gap-2 rounded border border-line-2 bg-panel px-2.5 py-2">
          <span className="text-faint w-20">Take profit</span>
          <input value={tp} onChange={(e) => setTp(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={`Trigger ${long ? "above" : "below"} mark`} className="num flex-1 bg-transparent outline-none" />
        </label>
        <label className="flex items-center gap-2 rounded border border-line-2 bg-panel px-2.5 py-2">
          <span className="text-faint w-20">Stop loss</span>
          <input value={sl} onChange={(e) => setSl(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={`Trigger ${long ? "below" : "above"} mark`} className="num flex-1 bg-transparent outline-none" />
        </label>
        <div className="flex justify-between text-faint">
          <span>Est. TP PnL <span className={clsx("num", pnlClass(t > 0 ? pnl(t) : null))}>{t > 0 ? fmtUsd(pnl(t)) : "--"}</span></span>
          <span>Est. SL PnL <span className={clsx("num", pnlClass(s > 0 ? pnl(s) : null))}>{s > 0 ? fmtUsd(pnl(s)) : "--"}</span></span>
        </div>
        <p className="text-faint">
          Triggers on the mark price. Setting both ties them to the whole position (one cancels the other). Setting one closes the current size.
          To change an existing TP/SL, cancel it in Open Orders first.
        </p>
        {errs.map((e) => <p key={e} className="text-short">{e}</p>)}
        <Button variant="accent" onClick={go} disabled={busy || errs.length > 0 || !(t > 0 || s > 0)}>{busy ? "Submitting…" : "Confirm"}</Button>
      </div>
    </Modal>
  );
}

export function OrdersTable({ orders }: { orders: RawOrder[] }) {
  const markets = useMarkets((s) => s.markets);
  const byId = useMarkets((s) => s.byId);
  const [busy, setBusy] = useState<string | null>(null);
  if (!orders.length) return <Empty>No open orders.</Empty>;

  const cancel = async (o: RawOrder) => {
    const key = String(o.order_index);
    setBusy(key);
    const { push, update } = useToasts.getState();
    const id = push({ title: `Cancel ${markets[byId[o.market_index]]?.base ?? o.market_index} ${orderLabel(o).toLowerCase()}`, state: "pending" });
    try {
      await cancelOrder(o.market_index, o.order_index);
      update(id, { state: "cancelled" });
    } catch (e) {
      logError("cancel", e);
      update(id, { state: "rejected", detail: humanizeError(e) });
    } finally {
      setBusy(null);
    }
  };

  const sorted = [...orders].sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp));
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-panel"><tr>
        {["Time", "Market", "Type", "Side", "Price", "Trigger", "Size", "Filled", "Reduce", ""].map((h) => <th key={h} className={th}>{h}</th>)}
      </tr></thead>
      <tbody>
        {sorted.map((o) => {
          const m = markets[byId[o.market_index]];
          const pxd = m?.pxDecimals ?? 2;
          const szd = m?.szDecimals ?? 4;
          const key = String(o.order_index);
          const size = Number(o.initial_base_amount);
          const trig = Number(o.trigger_price);
          return (
            <tr key={key} className="border-t border-line hover:bg-panel-2">
              <td className={clsx(td, "text-muted")}>{toMs(o.timestamp) ? fmtDateTime(toMs(o.timestamp)) : "--"}</td>
              <td className={td}><MarketCell marketId={o.market_index} /></td>
              <td className={td}>{orderLabel(o)}</td>
              <td className={clsx(td, o.is_ask ? "text-short" : "text-long")}>{o.is_ask ? "Sell" : "Buy"}</td>
              <td className={clsx(td, "num")}>{o.type === "market" ? "Market" : fmtPx(Number(o.price), pxd)}</td>
              <td className={clsx(td, "num")}>{trig > 0 ? fmtPx(trig, pxd) : "--"}</td>
              <td className={clsx(td, "num")}>{size > 0 ? fmtSize(size, szd) : "Position"}</td>
              <td className={clsx(td, "num")}>{fmtSize(Number(o.filled_base_amount) || 0, szd)}</td>
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

/** Poll a private endpoint that needs an auth token. */
function usePrivate<T>(load: (account: number, auth: string) => Promise<T>, deps: unknown[], everyMs = 15_000) {
  const accountIndex = useSession((s) => s.accountIndex);
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  useEffect(() => {
    if (accountIndex == null) return;
    let cancelled = false;
    const run = async () => {
      try {
        const data = await load(accountIndex, await getAuth());
        if (!cancelled) setState({ data, error: null, loading: false });
      } catch (e) {
        logError("private query", e);
        if (!cancelled) setState((s) => ({ ...s, error: humanizeError(e), loading: false }));
      }
    };
    run();
    const id = setInterval(run, everyMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIndex, everyMs, ...deps]);
  return state;
}

export function TradesTable({ marketId, limit = 100 }: { marketId?: number; limit?: number }) {
  const markets = useMarkets((s) => s.markets);
  const byId = useMarkets((s) => s.byId);
  const accountIndex = useSession((s) => s.accountIndex);
  const { data, error, loading } = usePrivate<RawTrade[]>((a, auth) => fetchAccountTrades(a, auth, limit, marketId), [limit, marketId]);
  const rows = useMemo(() => [...(data ?? [])].sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp)), [data]);
  if (error && !data) return <Empty>{error}</Empty>;
  if (loading && !data) return <div className="grid place-items-center py-8"><Spinner /></div>;
  if (!rows.length) return <Empty>No trades yet.</Empty>;
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-panel"><tr>
        {["Time", "Market", "Side", "Price", "Size", "Value", "Role", "Type"].map((h) => <th key={h} className={th}>{h}</th>)}
      </tr></thead>
      <tbody>
        {rows.map((f) => {
          const m = markets[byId[f.market_id]];
          const pxd = m?.pxDecimals ?? 2;
          const szd = m?.szDecimals ?? 4;
          const buyer = f.bid_account_id === accountIndex;
          // the maker is the resting order: the ask when is_maker_ask, else the bid
          const maker = f.is_maker_ask ? !buyer : buyer;
          return (
            <tr key={f.trade_id} className="border-t border-line hover:bg-panel-2">
              <td className={clsx(td, "text-muted")}>{fmtDateTime(toMs(f.timestamp))}</td>
              <td className={td}><MarketCell marketId={f.market_id} /></td>
              <td className={clsx(td, buyer ? "text-long" : "text-short")}>{buyer ? "Buy" : "Sell"}</td>
              <td className={clsx(td, "num")}>{fmtPx(Number(f.price), pxd)}</td>
              <td className={clsx(td, "num")}>{fmtSize(Number(f.size), szd)}</td>
              <td className={clsx(td, "num")}>{fmtUsd(Number(f.usd_amount))}</td>
              <td className={clsx(td, "text-muted")}>{maker ? "Maker" : "Taker"}</td>
              <td className={clsx(td, "text-muted capitalize")}>{f.type}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function FundingTable({ marketId }: { marketId?: number }) {
  const markets = useMarkets((s) => s.markets);
  const byId = useMarkets((s) => s.byId);
  const { data, error, loading } = usePrivate<RawFunding[]>((a, auth) => fetchFundingHistory(a, auth, 100, marketId), [marketId], 60_000);
  const list = useMemo(() => [...(data ?? [])].sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp)), [data]);
  if (error && !data) return <Empty>{error}</Empty>;
  if (loading && !data) return <div className="grid place-items-center py-8"><Spinner /></div>;
  if (!list.length) return <Empty>No funding payments yet.</Empty>;
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-panel"><tr>
        {["Time", "Market", "Side", "Size", "Payment"].map((h) => <th key={h} className={th}>{h}</th>)}
      </tr></thead>
      <tbody>
        {list.map((r, i) => {
          const m = markets[byId[r.market_id]];
          const pay = Number(r.change);
          return (
            <tr key={`${r.market_id}-${r.timestamp}-${i}`} className="border-t border-line">
              <td className={clsx(td, "text-muted")}>{fmtDateTime(toMs(r.timestamp))}</td>
              <td className={td}><MarketCell marketId={r.market_id} /></td>
              <td className={clsx(td, "capitalize")}>{r.position_side}</td>
              <td className={clsx(td, "num")}>{fmtSize(Number(r.position_size), m?.szDecimals ?? 4)}</td>
              <td className={clsx(td, "num", pnlClass(pay))}>{fmtUsd(pay, 4)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
