"use client";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import type { Market } from "@/lib/lighter/markets";
import { humanizeError, logError } from "@/lib/errors";
import { fmtPx, fmtSize, fmtUsd } from "@/lib/format";
import { integratorFor, placeOrder, updateLeverage, type Side, type Tif } from "@/lib/lighter/actions";
import { openConnect, openOnboard, useAccountStage, useSession } from "@/lib/lighter/session";
import { accountSummary, useMarketSettings, usePositions } from "@/lib/lighter/positions";
import { usePrefs } from "@/store/markets";
import { useTerminal } from "@/store/terminal";
import { useToasts } from "@/store/toasts";
import { useIsStale } from "@/hooks/useMarketData";
import { Button, Modal, Spinner } from "@/components/ui/primitives";

const clean = (v: string) => v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
const floorTo = (v: number, dec: number) => Math.floor(v * 10 ** dec + 1e-9) / 10 ** dec;

export function OrderPanel({ market }: { market: Market }) {
  // Remount on market change so the form starts clean.
  return <OrderForm key={market.id} market={market} />;
}

function OrderForm({ market }: { market: Market }) {
  const { stage } = useAccountStage();
  const account = useSession((s) => s.account);
  const tier = useSession((s) => s.tier);
  const summary = accountSummary(account);
  const stale = useIsStale();
  const pickedPx = useTerminal((s) => s.pickedPx);
  const slippage = usePrefs((s) => s.slippage);
  const setSlippage = usePrefs((s) => s.setSlippage);
  const positions = usePositions(market.id);
  const position = positions[0] ?? null;
  const { leverage, isolated } = useMarketSettings(market);
  const push = useToasts((s) => s.push);
  const update = useToasts((s) => s.update);

  const [side, setSide] = useState<Side>("buy");
  const [kind, setKind] = useState<"market" | "limit">("market");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"usd" | "base">("usd");
  const [tif, setTif] = useState<Tif>("GTT");
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tpsl, setTpsl] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [levOpen, setLevOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);

  // Clicking a price in the order book switches to a limit order at that price (once per click)
  const lastPick = useRef(pickedPx?.at ?? 0);
  useEffect(() => {
    if (!pickedPx || pickedPx.at === lastPick.current) return;
    lastPick.current = pickedPx.at;
    setKind("limit");
    setPrice(pickedPx.px.toFixed(market.pxDecimals));
  }, [pickedPx, market.pxDecimals]);

  const ctx = market.ctx;
  const mark = ctx?.markPx ?? 0;
  // What a market order is priced against: the far side of the book, falling back to mark.
  const bookPx = side === "buy" ? ctx?.bestAsk || mark : ctx?.bestBid || mark;
  const limitPx = Number(price) || 0;
  const refPx = kind === "limit" ? limitPx : bookPx;

  const rawAmount = Number(amount) || 0;
  const qty = refPx > 0 ? floorTo(unit === "usd" ? rawAmount / refPx : rawAmount, market.szDecimals) : 0;
  const notional = qty * refPx;
  const margin = leverage > 0 ? notional / leverage : 0;
  const available = summary?.available ?? 0;
  const maxQty = refPx > 0 ? floorTo((available * leverage) / refPx, market.szDecimals) : 0;
  const builderFee = stage === "ready" ? integratorFor() : null;

  const errors: string[] = [];
  if (rawAmount > 0) {
    if (qty < market.minBase) errors.push(`Minimum size is ${fmtSize(market.minBase, market.szDecimals)} ${market.base}.`);
    if (notional > 0 && notional < market.minNotional) errors.push(`Minimum order value is ${fmtUsd(market.minNotional, 0)}.`);
    if (kind === "limit" && !(limitPx > 0)) errors.push("Enter a limit price.");
    if (!reduceOnly && stage === "ready" && margin > available + 1e-9) errors.push("Not enough available margin at this leverage.");
    if (reduceOnly && position && position.side === side) errors.push("Reduce-only needs the opposite side of your position.");
    if (reduceOnly && !position) errors.push("You have no position in this market to reduce.");
  }
  if (tpsl) {
    const ref = refPx || mark;
    const t = Number(tp);
    const s = Number(sl);
    if (t > 0 && ref > 0 && (side === "buy" ? t <= ref : t >= ref)) errors.push(`Take profit should be ${side === "buy" ? "above" : "below"} the entry price.`);
    if (s > 0 && ref > 0 && (side === "buy" ? s >= ref : s <= ref)) errors.push(`Stop loss should be ${side === "buy" ? "below" : "above"} the entry price.`);
  }

  const warnings: string[] = [];
  if (stale) warnings.push("Live prices are delayed. Estimates may be out of date.");
  if (kind === "market" && mark > 0 && bookPx > 0 && Math.abs(bookPx - mark) / mark > 0.01) warnings.push("The book is more than 1% away from the mark price. Liquidity is thin.");
  if (market.category === "private") warnings.push("Pre-IPO market: prices track an implied valuation and can gap.");
  if (leverage >= 20) warnings.push(`${leverage}x leverage: a ${(100 / leverage).toFixed(1)}% move against you uses up your initial margin.`);

  const tradable = market.status === "active" || market.status === "reduce_only";
  const canSubmit = stage === "ready" && qty > 0 && errors.length === 0 && !busy && (market.status !== "reduce_only" || reduceOnly);

  const setPct = (pct: number) => {
    const base = reduceOnly && position ? Math.abs(position.qty) : maxQty;
    const q = floorTo((base * pct) / 100, market.szDecimals);
    if (!(q > 0)) return;
    setAmount(unit === "usd" ? (q * refPx).toFixed(2) : q.toFixed(market.szDecimals));
  };

  const doSubmit = async () => {
    if (inflight.current) return; // duplicate-submission guard
    inflight.current = true;
    setBusy(true);
    setConfirmOpen(false);
    const title = `${side === "buy" ? "Long" : "Short"} ${fmtSize(qty, market.szDecimals)} ${market.base} ${kind === "limit" ? "@ " + price : "market"}`;
    const id = push({ title, state: "pending", detail: "Signing and sending to Lighter…" });
    try {
      await placeOrder({
        market, side, kind, size: qty.toFixed(market.szDecimals), price: kind === "limit" ? price : undefined, tif,
        reduceOnly, slippage, refPrice: bookPx, tp: tpsl ? tp : undefined, sl: tpsl ? sl : undefined,
      });
      update(id, { state: "submitted", detail: kind === "limit" ? "Order accepted. It shows in Open Orders." : "Order sent. Fills show in Positions." });
      setAmount("");
      setTpsl(false);
      setTp("");
      setSl("");
    } catch (e) {
      logError("submit order", e);
      update(id, { state: "failed", detail: humanizeError(e) });
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="panel flex flex-col text-xs">
      <div className="grid grid-cols-2 gap-1 p-2">
        <button onClick={() => setSide("buy")} className={clsx("py-2 rounded font-semibold transition-colors", side === "buy" ? "bg-long text-black" : "bg-raised text-muted hover:text-fg")}>Long</button>
        <button onClick={() => setSide("sell")} className={clsx("py-2 rounded font-semibold transition-colors", side === "sell" ? "bg-short text-white" : "bg-raised text-muted hover:text-fg")}>Short</button>
      </div>

      <div className="flex items-center gap-2 px-2">
        {(["market", "limit"] as const).map((t) => (
          <button key={t} onClick={() => setKind(t)} className={clsx("px-2 py-1 rounded capitalize", kind === t ? "text-fg bg-raised" : "text-muted hover:text-fg")}>{t}</button>
        ))}
        <div className="flex-1" />
        <button onClick={() => setLevOpen(true)} disabled={stage !== "ready"}
          className="rounded border border-line-2 px-2 py-1 hover:border-accent/50 disabled:opacity-50" title="Margin mode & leverage">
          <span className="text-muted">{isolated ? "isolated" : "cross"}</span> <span className="num text-accent">{leverage}x</span>
        </button>
      </div>

      <div className="flex flex-col gap-2 p-2">
        <div className="flex justify-between text-muted">
          <span>Available to trade</span>
          <span className="num text-fg">{stage === "ready" || summary ? fmtUsd(available) : "--"}</span>
        </div>
        {position && (
          <div className="flex justify-between text-muted">
            <span>Current position</span>
            <span className={clsx("num", position.qty > 0 ? "text-long" : "text-short")}>{fmtSize(position.qty, market.szDecimals)} {market.base}</span>
          </div>
        )}

        {kind === "limit" && (
          <Field label="Price (USD)">
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(clean(e.target.value))} placeholder="0.00" className="num flex-1 bg-transparent outline-none min-w-0" />
            <button className="text-accent text-[11px]" onClick={() => mark && setPrice(mark.toFixed(market.pxDecimals))}>Mark</button>
          </Field>
        )}

        <Field label="Size">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(clean(e.target.value))} placeholder="0" className="num flex-1 bg-transparent outline-none min-w-0" />
          <button className="text-muted hover:text-fg text-[11px]" onClick={() => {
            // convert what's typed so the order size doesn't change
            if (refPx > 0 && rawAmount > 0) setAmount(unit === "usd" ? qty.toFixed(market.szDecimals) : (qty * refPx).toFixed(2));
            setUnit((u) => (u === "usd" ? "base" : "usd"));
          }}>
            {unit === "usd" ? "USD" : market.base} ⇄
          </button>
        </Field>
        <div className="flex justify-between text-faint">
          <span>{unit === "usd" ? `≈ ${fmtSize(qty, market.szDecimals)} ${market.base}` : `≈ ${fmtUsd(notional)}`}</span>
          <span>Min {fmtUsd(market.minNotional, 0)}</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[25, 50, 75, 100].map((p) => (
            <button key={p} onClick={() => setPct(p)} disabled={!(refPx > 0) || (reduceOnly ? !position : !(maxQty > 0))}
              className="rounded bg-raised py-1 text-muted hover:text-fg disabled:opacity-40">{p}%</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <label className="flex items-center gap-1.5 text-muted cursor-pointer">
            <input type="checkbox" checked={reduceOnly} onChange={(e) => { setReduceOnly(e.target.checked); if (e.target.checked) setTpsl(false); }} className="accent-[#18d98b]" /> Reduce only
          </label>
          <label className="flex items-center gap-1.5 text-muted cursor-pointer">
            <input type="checkbox" checked={tpsl} disabled={reduceOnly} onChange={(e) => setTpsl(e.target.checked)} className="accent-[#18d98b]" /> TP / SL
          </label>
          {kind === "limit" ? (
            <select value={tif} onChange={(e) => setTif(e.target.value as Tif)} className="ml-auto bg-panel-2 border border-line-2 rounded px-1 py-0.5 text-muted">
              <option value="GTT">GTC (28 days)</option><option value="IOC">IOC</option><option value="POST_ONLY">Post only</option>
            </select>
          ) : (
            <select value={slippage} onChange={(e) => setSlippage(Number(e.target.value))} className="ml-auto bg-panel-2 border border-line-2 rounded px-1 py-0.5 text-muted" title="Max slippage">
              {[0.0025, 0.005, 0.01, 0.02, 0.05].map((v) => <option key={v} value={v}>Slippage {(v * 100).toFixed(2).replace(/\.?0+$/, "")}%</option>)}
            </select>
          )}
        </div>

        {tpsl && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="TP">
              <input inputMode="decimal" value={tp} onChange={(e) => setTp(clean(e.target.value))} placeholder="Trigger" className="num w-full bg-transparent outline-none min-w-0" />
            </Field>
            <Field label="SL">
              <input inputMode="decimal" value={sl} onChange={(e) => setSl(clean(e.target.value))} placeholder="Trigger" className="num w-full bg-transparent outline-none min-w-0" />
            </Field>
            <PnlHint pnl={Number(tp) > 0 && qty > 0 && refPx > 0 ? (Number(tp) - refPx) * qty * (side === "buy" ? 1 : -1) : null} />
            <PnlHint pnl={Number(sl) > 0 && qty > 0 && refPx > 0 ? (Number(sl) - refPx) * qty * (side === "buy" ? 1 : -1) : null} />
            <p className="col-span-2 text-faint">Triggers on the mark price after your order fills and closes the filled size.</p>
          </div>
        )}

        <div className="flex flex-col gap-1 rounded border border-line bg-panel-2 p-2 mt-1">
          <Row k={kind === "limit" ? "Limit price" : side === "buy" ? "Best ask" : "Best bid"} v={fmtPx(refPx || null, market.pxDecimals)} />
          {kind === "market" && <Row k="Worst fill price" v={bookPx > 0 ? fmtPx(side === "buy" ? bookPx * (1 + slippage) : bookPx * (1 - slippage), market.pxDecimals) : "--"} />}
          <Row k="Position value" v={fmtUsd(notional)} />
          <Row k="Required margin" v={notional > 0 ? fmtUsd(margin) : "--"} />
          <Row k="Lighter fee" v={tier && !/standard/i.test(tier) ? `Per your ${tier} tier` : market.takerFee === 0 && market.makerFee === 0 ? "0% (Standard account)" : `${market.takerFee}% taker / ${market.makerFee}% maker`} />
          {builderFee && <Row k="Elyperp builder fee" v={`${((builderFee.takerFee / 1_000_000) * 100).toFixed(4)}% taker`} />}
        </div>

        {errors.length > 0 && <ul className="text-short flex flex-col gap-0.5">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
        {rawAmount > 0 && warnings.length > 0 && <ul className="text-warn flex flex-col gap-0.5">{warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}

        {!tradable ? (
          <Button className="w-full py-2.5" disabled>Market is {market.status.replace("_", " ")}</Button>
        ) : stage === "disconnected" ? (
          <Button variant="accent" className="w-full py-2.5" onClick={openConnect}>Connect wallet to trade</Button>
        ) : stage === "checking" ? (
          <Button className="w-full py-2.5" disabled><Spinner /> Checking account…</Button>
        ) : stage !== "ready" ? (
          <Button variant="accent" className="w-full py-2.5" onClick={openOnboard}>{stage === "no_account" ? "Deposit to start trading" : "Enable trading"}</Button>
        ) : (
          <Button variant={side === "buy" ? "long" : "short"} className="w-full py-2.5 font-semibold" disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
            {busy ? <Spinner /> : `${side === "buy" ? "Buy / Long" : "Sell / Short"} ${market.base}`}
          </Button>
        )}
        {market.status === "reduce_only" && <p className="text-warn">This market only accepts reduce-only orders right now.</p>}
      </div>

      <LeverageModal open={levOpen} onClose={() => setLevOpen(false)} market={market} current={leverage} isolated={isolated} hasPosition={!!position} />

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm order">
        <div className="flex flex-col gap-1.5 text-xs">
          <Row k="Market" v={<span className="num">{market.base}-PERP</span>} />
          <Row k="Side" v={<span className={side === "buy" ? "text-long" : "text-short"}>{side === "buy" ? "LONG" : "SHORT"}{reduceOnly ? " (reduce only)" : ""}</span>} />
          <Row k="Type" v={kind === "limit" ? `Limit ${tif === "POST_ONLY" ? "post-only" : tif === "IOC" ? "IOC" : "GTC"}` : `Market (max slippage ${(slippage * 100).toFixed(2)}%)`} />
          <Row k="Size" v={`${fmtSize(qty, market.szDecimals)} ${market.base}`} />
          <Row k="Price" v={kind === "limit" ? fmtPx(limitPx, market.pxDecimals) : `Market (${side === "buy" ? "ask" : "bid"} ${fmtPx(bookPx, market.pxDecimals)})`} />
          <Row k="Value" v={fmtUsd(notional)} />
          <Row k="Leverage" v={`${leverage}x ${isolated ? "isolated" : "cross"}`} />
          {tpsl && Number(tp) > 0 && <Row k="Take profit" v={tp} />}
          {tpsl && Number(sl) > 0 && <Row k="Stop loss" v={sl} />}
          {warnings.length > 0 && <ul className="text-warn mt-1">{warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant={side === "buy" ? "long" : "short"} onClick={doSubmit} disabled={busy}>Confirm</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 rounded border border-line-2 bg-panel-2 px-2.5 py-2 focus-within:border-accent/60">
      <span className="text-faint shrink-0">{label}</span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="num text-right">{v}</span>
    </div>
  );
}

function PnlHint({ pnl }: { pnl: number | null }) {
  if (pnl == null || !Number.isFinite(pnl)) return <span />;
  return <span className={clsx("num text-[11px]", pnl >= 0 ? "text-long" : "text-short")}>Est. PnL {fmtUsd(pnl)}</span>;
}

export function LeverageModal({ open, onClose, market, current, isolated, hasPosition }: {
  open: boolean; onClose: () => void; market: Market; current: number; isolated: boolean; hasPosition: boolean;
}) {
  const [lev, setLev] = useState(current);
  const [iso, setIso] = useState(isolated);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setLev(Math.min(current, market.maxLeverage)); setIso(isolated); setErr(null); } }, [open, current, isolated, market.maxLeverage]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await updateLeverage(market, lev, iso);
      useToasts.getState().push({ title: `${market.base} set to ${lev}x ${iso ? "isolated" : "cross"}`, state: "success" });
      onClose();
    } catch (e) {
      logError("update leverage", e);
      setErr(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`${market.base} margin & leverage`}>
      <div className="flex flex-col gap-4 text-xs">
        <div className="grid grid-cols-2 gap-1">
          {([false, true] as const).map((m) => (
            <button key={String(m)} onClick={() => setIso(m)}
              className={clsx("py-2 rounded", iso === m ? "bg-accent/10 text-accent border border-accent/40" : "bg-raised text-muted")}>
              {m ? "Isolated" : "Cross"}
            </button>
          ))}
        </div>
        <div>
          <div className="flex justify-between mb-2"><span className="text-muted">Leverage</span><span className="num text-accent text-sm">{lev}x</span></div>
          <input type="range" min={1} max={Math.max(1, market.maxLeverage)} step={1} value={lev} onChange={(e) => setLev(Number(e.target.value))} className="w-full" />
          <div className="flex justify-between text-faint mt-1"><span>1x</span><span>{market.maxLeverage}x max</span></div>
        </div>
        {lev >= Math.min(20, market.maxLeverage) && lev > 5 && <p className="text-warn">High leverage increases liquidation risk.</p>}
        {hasPosition && <p className="text-faint">You have an open position. Lighter rejects a change that would leave it under-margined, and may not allow switching margin mode until it&apos;s closed.</p>}
        {err && <p className="text-short">{err}</p>}
        <Button variant="accent" onClick={save} disabled={busy}>{busy ? "Updating…" : "Confirm"}</Button>
      </div>
    </Modal>
  );
}
