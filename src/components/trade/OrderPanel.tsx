"use client";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAccountInfo, useMarginModeBySymbol, useOrderEntry, usePositionStream, useSymbolLeverage, useSymbolsInfo,
} from "@orderly.network/hooks";
import { MarginMode, OrderSide, OrderType } from "@orderly.network/types";
import type { Market } from "@/lib/orderly/markets";
import { humanizeError, logError } from "@/lib/errors";
import { fmtPx, fmtSize, fmtUsd } from "@/lib/format";
import { openConnect, openOnboard, useAccountStage } from "@/lib/orderly/account";
import { useMarkets } from "@/store/markets";
import { useTerminal } from "@/store/terminal";
import { useToasts } from "@/store/toasts";
import { useIsStale } from "@/hooks/useMarketData";
import { Button, Modal, Spinner } from "@/components/ui/primitives";

type Tif = "GTC" | "IOC" | "FOK" | "POST_ONLY";

export function OrderPanel({ market }: { market: Market }) {
  const symbols = useSymbolsInfo();
  const ready = !symbols.isNil && !!symbols[market.symbol]?.("symbol");
  const { marginMode } = useMarginModeBySymbol(market.symbol);
  if (!ready) {
    return <div className="panel grid place-items-center py-16 text-xs text-muted"><span className="flex items-center gap-2"><Spinner /> Loading market…</span></div>;
  }
  // Remount when the market or margin mode changes so the order form starts clean.
  return <OrderEntryForm key={`${market.symbol}:${marginMode}`} market={market} marginMode={marginMode ?? MarginMode.CROSS} />;
}

function OrderEntryForm({ market, marginMode }: { market: Market; marginMode: MarginMode }) {
  const { stage } = useAccountStage();
  const sessionOpen = useMarkets((s) => s.sessions[market.symbol]?.open);
  const stale = useIsStale();
  const pickedPx = useTerminal((s) => s.pickedPx);
  const { data: accountInfo } = useAccountInfo();
  const [{ rows: positions }] = usePositionStream(market.symbol);
  const { maxLeverage } = useSymbolLeverage(market.symbol);
  const push = useToasts((s) => s.push);
  const update = useToasts((s) => s.update);

  const entry = useOrderEntry(market.symbol, {
    initialOrder: { side: OrderSide.BUY, order_type: OrderType.MARKET, margin_mode: marginMode },
  });
  const { formattedOrder: o, setValue, setValues, metaState, submit, maxQty, estLiqPrice, estLeverage, estSlippage, freeCollateral, symbolLeverage, markPrice, isMutating } = entry;

  const [tif, setTif] = useState<Tif>("GTC");
  const [sizeUnit, setSizeUnit] = useState<"base" | "usd">("usd");
  const [tpsl, setTpsl] = useState(false);
  const [levOpen, setLevOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inflight = useRef(false);

  const side = o.side === OrderSide.SELL ? "short" : "long";
  const isLimit = o.order_type === OrderType.LIMIT;
  const position = positions?.find((p) => p.symbol === market.symbol && (p.margin_mode ?? MarginMode.CROSS) === marginMode && p.position_qty !== 0) ?? null;
  const leverage = symbolLeverage ?? position?.leverage ?? null;

  // Clicking a price in the order book switches to a limit order at that price (once per click)
  const lastPick = useRef(pickedPx?.at ?? 0);
  useEffect(() => {
    if (!pickedPx || pickedPx.at === lastPick.current) return;
    lastPick.current = pickedPx.at;
    setValues({ order_type: OrderType.LIMIT, order_price: pickedPx.px.toFixed(market.pxDecimals) });
  }, [pickedPx, market.pxDecimals, setValues]);

  const setTifValue = (t: Tif) => {
    setTif(t);
    setValue("order_type_ext", t === "GTC" ? undefined : (t as OrderType));
  };

  const qty = Number(o.order_quantity) || 0;
  const total = Number(o.total) || 0;
  const refPx = isLimit ? Number(o.order_price) || 0 : markPrice ?? market.ctx?.markPx ?? 0;
  const isRwa = market.category !== "crypto";
  const takerBps = Number((isRwa ? accountInfo?.rwa_taker_fee_rate : undefined) ?? accountInfo?.futures_taker_fee_rate ?? NaN);
  const makerBps = Number((isRwa ? accountInfo?.rwa_maker_fee_rate : undefined) ?? accountInfo?.futures_maker_fee_rate ?? NaN);
  const isMaker = isLimit && tif === "POST_ONLY";
  const feeBps = isMaker ? makerBps : takerBps;
  const feeEst = Number.isFinite(feeBps) && total > 0 ? (total * feeBps) / 10_000 : null;
  const marginEst = leverage && total > 0 ? total / leverage : null;

  const errors = useMemo(() => {
    const e = metaState.errors ?? {};
    return Object.entries(e)
      .filter(([k]) => metaState.dirty[k as keyof typeof metaState.dirty] || metaState.submitted)
      .map(([, v]) => v?.message)
      .filter((m): m is string => !!m);
  }, [metaState]);

  const warnings: string[] = [];
  if (stale) warnings.push("Live prices are delayed. Estimates may be out of date.");
  if (market.session && sessionOpen === false) warnings.push("This market's trading session is closed. Orders may be rejected until it opens.");
  if (estSlippage != null && estSlippage > 0.01 && !isLimit) warnings.push(`Estimated slippage is ${(estSlippage * 100).toFixed(2)}%. Liquidity is thin.`);
  if (estLiqPrice && refPx > 0 && Math.abs(estLiqPrice - refPx) / refPx < 0.05 && !o.reduce_only) warnings.push(`Liquidation is only ~${((Math.abs(estLiqPrice - refPx) / refPx) * 100).toFixed(1)}% from entry.`);
  if (market.builder) warnings.push(`Listed on Orderly by the builder "${market.builder}". Its oracle and settings are set by that builder.`);

  const blocker = stage === "unavailable" ? "unavailable" : stage === "disconnected" ? "connect" : stage === "checking" ? "loading" : stage !== "ready" ? "setup" : null;
  const tradable = market.status === "active" || market.status === "reduce_only" || market.status === "post_only";

  const setPct = (pct: number) => {
    if (!(maxQty > 0)) return;
    const raw = (maxQty * pct) / 100;
    const stepped = Math.floor(raw / market.baseTick) * market.baseTick;
    setValue("order_quantity", stepped.toFixed(market.szDecimals));
  };

  const doSubmit = async () => {
    if (inflight.current) return; // duplicate-submission guard
    inflight.current = true;
    setConfirmOpen(false);
    const title = `${side === "long" ? "Long" : "Short"} ${fmtSize(qty, market.szDecimals)} ${market.base} ${isLimit ? "@ " + o.order_price : "market"}`;
    const id = push({ title, state: "pending", detail: "Sending to Orderly…" });
    try {
      const res = await submit({ resetOnSuccess: true });
      if (res?.success) {
        update(id, { state: "submitted", detail: isLimit ? "Order accepted" : "Order sent. Fills show in Positions." });
        setTpsl(false);
      } else {
        update(id, { state: "failed", detail: humanizeError((res as { message?: string })?.message ?? "Order rejected") });
      }
    } catch (e) {
      logError("submit order", e);
      // validation errors come back as an object of field messages
      const msg = e && typeof e === "object" && !(e instanceof Error)
        ? Object.values(e as Record<string, { message?: string }>).map((v) => v?.message).filter(Boolean).join(" · ")
        : humanizeError(e);
      update(id, { state: "failed", detail: msg || humanizeError(e) });
    } finally {
      inflight.current = false;
    }
  };

  return (
    <div className="panel flex flex-col text-xs">
      <div className="grid grid-cols-2 gap-1 p-2">
        <button onClick={() => setValue("side", OrderSide.BUY)} className={clsx("py-2 rounded font-semibold transition-colors", side === "long" ? "bg-long text-black" : "bg-raised text-muted hover:text-fg")}>Long</button>
        <button onClick={() => setValue("side", OrderSide.SELL)} className={clsx("py-2 rounded font-semibold transition-colors", side === "short" ? "bg-short text-white" : "bg-raised text-muted hover:text-fg")}>Short</button>
      </div>

      <div className="flex items-center gap-2 px-2">
        {([OrderType.MARKET, OrderType.LIMIT] as const).map((t) => (
          <button key={t} onClick={() => setValue("order_type", t)} className={clsx("px-2 py-1 rounded capitalize", o.order_type === t ? "text-fg bg-raised" : "text-muted hover:text-fg")}>{t.toLowerCase()}</button>
        ))}
        <div className="flex-1" />
        <button onClick={() => setLevOpen(true)} disabled={stage !== "ready"}
          className="rounded border border-line-2 px-2 py-1 hover:border-accent/50 disabled:opacity-50" title="Margin mode & leverage">
          <span className="capitalize text-muted">{marginMode.toLowerCase()}</span> <span className="num text-accent">{leverage ? `${leverage}x` : "--"}</span>
        </button>
      </div>

      <div className="flex flex-col gap-2 p-2">
        <div className="flex justify-between text-muted">
          <span>Available to trade</span>
          <span className="num text-fg">{stage === "ready" ? fmtUsd(freeCollateral) : "--"}</span>
        </div>
        {position && (
          <div className="flex justify-between text-muted">
            <span>Current position</span>
            <span className={clsx("num", position.position_qty > 0 ? "text-long" : "text-short")}>{fmtSize(position.position_qty, market.szDecimals)} {market.base}</span>
          </div>
        )}

        {isLimit && (
          <Field label="Price (USD)">
            <input inputMode="decimal" value={o.order_price ?? ""} onChange={(e) => setValue("order_price", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="num flex-1 bg-transparent outline-none min-w-0" />
            <button className="text-accent text-[11px]" onClick={() => markPrice && setValue("order_price", markPrice.toFixed(market.pxDecimals))}>Mark</button>
          </Field>
        )}

        <Field label="Size">
          {sizeUnit === "usd" ? (
            <input inputMode="decimal" value={o.total ?? ""} onChange={(e) => setValue("total", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className="num flex-1 bg-transparent outline-none min-w-0" />
          ) : (
            <input inputMode="decimal" value={o.order_quantity ?? ""} onChange={(e) => setValue("order_quantity", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className="num flex-1 bg-transparent outline-none min-w-0" />
          )}
          <button className="text-muted hover:text-fg text-[11px]" onClick={() => setSizeUnit((u) => (u === "usd" ? "base" : "usd"))}>
            {sizeUnit === "usd" ? "USD" : market.base} ⇄
          </button>
        </Field>
        <div className="flex justify-between text-faint">
          <span>{sizeUnit === "usd" ? `≈ ${fmtSize(qty, market.szDecimals)} ${market.base}` : `≈ ${fmtUsd(total)}`}</span>
          <span>Min {fmtUsd(market.minNotional, 0)}</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[25, 50, 75, 100].map((p) => (
            <button key={p} onClick={() => setPct(p)} disabled={!(maxQty > 0)}
              className="rounded bg-raised py-1 text-muted hover:text-fg disabled:opacity-40">{p}%</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <label className="flex items-center gap-1.5 text-muted cursor-pointer">
            <input type="checkbox" checked={!!o.reduce_only} onChange={(e) => { setValue("reduce_only", e.target.checked); if (e.target.checked) { setTpsl(false); setValues({ tp_trigger_price: undefined, sl_trigger_price: undefined }); } }} className="accent-[#18d98b]" /> Reduce only
          </label>
          <label className="flex items-center gap-1.5 text-muted cursor-pointer">
            <input type="checkbox" checked={tpsl} disabled={!!o.reduce_only} onChange={(e) => { setTpsl(e.target.checked); if (!e.target.checked) setValues({ tp_trigger_price: undefined, sl_trigger_price: undefined }); }} className="accent-[#18d98b]" /> TP / SL
          </label>
          {isLimit && (
            <select value={tif} onChange={(e) => setTifValue(e.target.value as Tif)} className="ml-auto bg-panel-2 border border-line-2 rounded px-1 py-0.5 text-muted">
              <option value="GTC">GTC</option><option value="IOC">IOC</option><option value="FOK">FOK</option><option value="POST_ONLY">Post only</option>
            </select>
          )}
        </div>

        {tpsl && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Take profit">
              <input inputMode="decimal" value={o.tp_trigger_price ?? ""} onChange={(e) => setValue("tp_trigger_price", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Price" className="num w-full bg-transparent outline-none min-w-0" />
            </Field>
            <Field label="Stop loss">
              <input inputMode="decimal" value={o.sl_trigger_price ?? ""} onChange={(e) => setValue("sl_trigger_price", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Price" className="num w-full bg-transparent outline-none min-w-0" />
            </Field>
            <PnlHint pnl={o.tp_pnl} />
            <PnlHint pnl={o.sl_pnl} />
          </div>
        )}

        <div className="flex flex-col gap-1 rounded border border-line bg-panel-2 p-2 mt-1">
          <Row k={isLimit ? "Entry price" : "Mark price"} v={fmtPx(refPx || null, market.pxDecimals)} />
          {!isLimit && <Row k="Est. slippage" v={estSlippage != null ? `${(estSlippage * 100).toFixed(2)}%` : "--"} />}
          <Row k="Position value" v={fmtUsd(total)} />
          <Row k="Required margin" v={marginEst != null ? fmtUsd(marginEst) : "--"} />
          <Row k={`Est. fee${Number.isFinite(feeBps) ? ` (${isMaker ? "maker" : "taker"} ${(feeBps / 100).toFixed(3)}%)` : ""}`} v={feeEst != null ? fmtUsd(feeEst, 4) : "--"} />
          {estLeverage != null && <Row k="Account leverage after" v={`${estLeverage.toFixed(2)}x`} />}
          <Row k="Est. liquidation price" v={o.reduce_only ? "--" : <span className="text-warn">{fmtPx(estLiqPrice, market.pxDecimals)}</span>} />
        </div>

        {errors.length > 0 && <ul className="text-short flex flex-col gap-0.5">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
        {qty > 0 && warnings.length > 0 && <ul className="text-warn flex flex-col gap-0.5">{warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}

        {!tradable ? (
          <Button className="w-full py-2.5" disabled>Market is {market.status.replace("_", " ")}</Button>
        ) : blocker === "unavailable" ? (
          <Button className="w-full py-2.5" disabled>Trading opens soon</Button>
        ) : blocker === "connect" ? (
          <Button variant="accent" className="w-full py-2.5" onClick={openConnect}>Connect wallet to trade</Button>
        ) : blocker === "loading" ? (
          <Button className="w-full py-2.5" disabled><Spinner /> Checking account…</Button>
        ) : blocker === "setup" ? (
          <Button variant="accent" className="w-full py-2.5" onClick={openOnboard}>Set up account to trade</Button>
        ) : (
          <Button variant={side} className="w-full py-2.5 font-semibold" disabled={isMutating || !(qty > 0)} onClick={() => setConfirmOpen(true)}>
            {isMutating ? <Spinner /> : `${side === "long" ? "Buy / Long" : "Sell / Short"} ${market.base}`}
          </Button>
        )}
      </div>

      <LeverageModal open={levOpen} onClose={() => setLevOpen(false)} market={market} current={leverage ?? 1}
        maxLeverage={maxLeverage || market.maxLeverage} marginMode={marginMode} hasPosition={!!position} />

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm order">
        <div className="flex flex-col gap-1.5 text-xs">
          <Row k="Market" v={<span className="num">{market.base}-PERP{market.builder ? ` (${market.builder})` : ""}</span>} />
          <Row k="Side" v={<span className={side === "long" ? "text-long" : "text-short"}>{side.toUpperCase()}{o.reduce_only ? " (reduce only)" : ""}</span>} />
          <Row k="Type" v={isLimit ? `Limit ${tif === "POST_ONLY" ? "post-only" : tif}` : "Market"} />
          <Row k="Size" v={`${fmtSize(qty, market.szDecimals)} ${market.base}`} />
          <Row k="Price" v={isLimit ? fmtPx(Number(o.order_price), market.pxDecimals) : `Market (mark ${fmtPx(refPx, market.pxDecimals)})`} />
          <Row k="Value" v={fmtUsd(total)} />
          <Row k="Leverage" v={leverage ? `${leverage}x ${marginMode.toLowerCase()}` : "--"} />
          <Row k="Est. fee" v={feeEst != null ? fmtUsd(feeEst, 4) : "--"} />
          <Row k="Est. liquidation" v={fmtPx(estLiqPrice, market.pxDecimals)} />
          {tpsl && Number(o.tp_trigger_price) > 0 && <Row k="Take profit" v={o.tp_trigger_price} />}
          {tpsl && Number(o.sl_trigger_price) > 0 && <Row k="Stop loss" v={o.sl_trigger_price} />}
          {warnings.length > 0 && <ul className="text-warn mt-1">{warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant={side} onClick={doSubmit} disabled={isMutating}>Confirm</Button>
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

function PnlHint({ pnl }: { pnl?: string }) {
  const v = Number(pnl);
  if (!pnl || !Number.isFinite(v)) return <span />;
  return <span className={clsx("num text-[11px]", v >= 0 ? "text-long" : "text-short")}>Est. PnL {fmtUsd(v)}</span>;
}

export function LeverageModal({ open, onClose, market, current, maxLeverage, marginMode, hasPosition }: {
  open: boolean; onClose: () => void; market: Market; current: number; maxLeverage: number; marginMode: MarginMode; hasPosition: boolean;
}) {
  const { update: updateLeverage } = useSymbolLeverage(market.symbol);
  const { update: updateMode } = useMarginModeBySymbol(market.symbol);
  const [lev, setLev] = useState(current);
  const [mode, setMode] = useState<MarginMode>(marginMode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setLev(Math.min(current, maxLeverage)); setMode(marginMode); setErr(null); } }, [open, current, marginMode, maxLeverage]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (mode !== marginMode) {
        const r = await updateMode(mode);
        if (!r.success) throw new Error(r.message || "Couldn't change margin mode");
      }
      await updateLeverage({ leverage: lev, symbol: market.symbol, margin_mode: mode });
      useToasts.getState().push({ title: `${market.base} set to ${lev}x ${mode.toLowerCase()}`, state: "success" });
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
          {([MarginMode.CROSS, MarginMode.ISOLATED] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={clsx("py-2 rounded capitalize", mode === m ? "bg-accent/10 text-accent border border-accent/40" : "bg-raised text-muted")}>
              {m.toLowerCase()}
            </button>
          ))}
        </div>
        <div>
          <div className="flex justify-between mb-2"><span className="text-muted">Leverage</span><span className="num text-accent text-sm">{lev}x</span></div>
          <input type="range" min={1} max={Math.max(1, maxLeverage)} step={1} value={lev} onChange={(e) => setLev(Number(e.target.value))} className="w-full" />
          <div className="flex justify-between text-faint mt-1"><span>1x</span><span>{maxLeverage}x max</span></div>
        </div>
        {lev >= Math.min(20, maxLeverage) && lev > 5 && <p className="text-warn">High leverage increases liquidation risk.</p>}
        {hasPosition && <p className="text-faint">You have an open position. Orderly may reject a change that would leave it under-margined.</p>}
        {err && <p className="text-short">{err}</p>}
        <Button variant="accent" onClick={save} disabled={busy}>{busy ? "Updating…" : "Confirm"}</Button>
      </div>
    </Modal>
  );
}
