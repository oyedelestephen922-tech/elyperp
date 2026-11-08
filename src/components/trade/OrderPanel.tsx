"use client";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "wagmi";
import type { Market } from "@/lib/hl/markets";
import {
  BASE_MAKER_FEE, BASE_TAKER_FEE, checkOrder, estimateFee, estimateLiqPx, marketOrderPx, roundPrice, walkBook, type Side,
} from "@/lib/hl/math";
import { placeOrder, updateLeverage, type LegResult } from "@/lib/hl/trade";
import { humanizeError, logError } from "@/lib/hl/errors";
import { fmtPx, fmtUsd } from "@/lib/format";
import { useTrading } from "@/components/providers/TradingProvider";
import { selectPositions, useAccountStore } from "@/store/account";
import { usePrefs } from "@/store/markets";
import { useTerminal } from "@/store/terminal";
import { useToasts } from "@/store/toasts";
import { useActiveAsset } from "@/hooks/useActiveAsset";
import { useIsStale, useL2Book } from "@/hooks/useMarketData";
import { Button, Modal, Spinner } from "@/components/ui/primitives";

type OrderType = "market" | "limit";

export function OrderPanel({ market }: { market: Market }) {
  const { isConnected, address } = useConnection();
  const { status: agentStatus, exchange } = useTrading();
  const states = useAccountStore((s) => s.states);
  const fees = useAccountStore((s) => s.fees);
  const accountLoaded = useAccountStore((s) => s.loaded);
  const { slippage, setSlippage } = usePrefs();
  const pickedPx = useTerminal((s) => s.pickedPx);
  const { data: asset, refresh: refreshAsset } = useActiveAsset(market.coin);
  const stale = useIsStale(market.dex, market.coin);
  const book = useL2Book(market.coin, null);
  const push = useToasts((s) => s.push);
  const update = useToasts((s) => s.update);

  const [side, setSide] = useState<Side>("long");
  const [type, setType] = useState<OrderType>("market");
  const [tif, setTif] = useState<"Gtc" | "Ioc" | "Alo">("Gtc");
  const [pxStr, setPxStr] = useState("");
  const [sizeStr, setSizeStr] = useState("");
  const [sizeUnit, setSizeUnit] = useState<"base" | "usd">("usd");
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tpsl, setTpsl] = useState(false);
  const [tpStr, setTpStr] = useState("");
  const [slStr, setSlStr] = useState("");
  const [levOpen, setLevOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inflight = useRef(false);

  // Reset form when market changes
  useEffect(() => {
    setPxStr(""); setSizeStr(""); setTpStr(""); setSlStr(""); setReduceOnly(false);
  }, [market.coin]);

  // Clicking a price in the order book switches to a limit order at that price
  useEffect(() => {
    if (!pickedPx) return;
    setType("limit");
    setPxStr(roundPrice(pickedPx.px, market.szDecimals));
  }, [pickedPx, market.szDecimals]);

  const leverage = asset?.leverage.value ?? Math.min(10, market.maxLeverage);
  const marginType = asset?.leverage.type ?? (market.isolatedOnly ? "isolated" : "cross");
  const refPx = market.ctx?.midPx ?? market.ctx?.markPx ?? 0;
  const limitPx = Number(pxStr) || 0;
  const pxForSize = type === "limit" && limitPx > 0 ? limitPx : refPx;
  const sizeInput = Number(sizeStr) || 0;
  const sizeBase = sizeUnit === "base" ? sizeInput : pxForSize > 0 ? sizeInput / pxForSize : 0;
  const maxSize = asset ? Number(asset.maxTradeSzs[side === "long" ? 0 : 1]) : null;
  const available = asset ? Number(asset.availableToTrade[side === "long" ? 0 : 1]) : null;
  const position = selectPositions(states).find((p) => p.coin === market.coin) ?? null;

  const check = useMemo(
    () =>
      checkOrder({
        side, type, size: sizeBase, limitPx: type === "limit" ? limitPx : undefined, refPx, leverage,
        maxLeverage: market.maxLeverage, szDecimals: market.szDecimals, reduceOnly,
        availableMargin: null, maxSize: isConnected ? maxSize : null,
        tpPx: tpsl ? Number(tpStr) || undefined : undefined, slPx: tpsl ? Number(slStr) || undefined : undefined,
        marketActive: market.status === "active",
      }),
    [side, type, sizeBase, limitPx, refPx, leverage, market, reduceOnly, maxSize, isConnected, tpsl, tpStr, slStr],
  );

  const takerRate = fees ? Number(fees.userCrossRate) : BASE_TAKER_FEE;
  const makerRate = fees ? Number(fees.userAddRate) : BASE_MAKER_FEE;
  const crosses = type === "market" || tif === "Ioc" || (limitPx > 0 && refPx > 0 && (side === "long" ? limitPx >= refPx : limitPx <= refPx));
  const feeRate = crosses ? takerRate : makerRate;
  const sz = Number(check.sizeStr);
  const worstPx = type === "market" && refPx > 0 ? Number(marketOrderPx(refPx, side === "long", slippage, market.szDecimals)) : null;
  const bookSide = book ? (side === "long" ? book.asks : book.bids) : null;
  const fill = type === "market" && bookSide && sz > 0 ? walkBook(bookSide, sz, side === "long", worstPx ?? undefined) : null;
  const bestPx = bookSide?.[0]?.px ?? null;
  const entryPx = type === "market" ? fill?.avgPx ?? bestPx ?? refPx : limitPx;
  const spreadPct = book?.asks[0] && book?.bids[0] ? (book.asks[0].px - book.bids[0].px) / book.bids[0].px : null;
  const fee = estimateFee(sz, entryPx, feeRate);
  const dexState = states[market.dex];
  const crossFree = dexState ? Number(dexState.withdrawable) : 0;
  const liqPx = sz > 0 && entryPx > 0
    ? estimateLiqPx({ side, entryPx, size: sz, margin: marginType === "isolated" ? check.margin : crossFree + check.margin, maxLeverage: market.maxLeverage })
    : null;
  const liqDistance = liqPx && entryPx ? Math.abs(liqPx - entryPx) / entryPx : null;

  const warnings = [...check.warnings];
  if (stale) warnings.unshift("Live prices are delayed. Estimates may be out of date.");
  if (type === "market" && sz > 0 && fill) {
    if (fill.filled === 0) warnings.unshift(`Nothing on the book within ${(slippage * 100).toFixed(1)}% slippage. This order won't fill. Raise slippage or use a limit order.`);
    else if (fill.filled + 1e-12 < sz) warnings.unshift(`Only ~${fill.filled.toFixed(market.szDecimals)} ${market.base} is available within your slippage. The rest will be cancelled.`);
  }
  if (spreadPct != null && spreadPct > 0.01) warnings.push(`Wide spread (${(spreadPct * 100).toFixed(2)}%). Liquidity is thin on this market.`);
  if (type === "market" && slippage > 0.02) warnings.push(`Slippage tolerance is ${(slippage * 100).toFixed(1)}%, you may fill well away from the mark.`);
  if (liqDistance != null && liqDistance < 0.05 && !reduceOnly) warnings.push(`Liquidation is only ~${(liqDistance * 100).toFixed(1)}% from entry.`);
  if (market.dex && market.category !== "crypto") warnings.push("HIP-3 market: oracle, hours and halts are set by the deployer. Check the market info bar.");

  const blocker = !isConnected
    ? "connect"
    : !accountLoaded
      ? "loading"
      : agentStatus !== "ready"
        ? "enable"
        : null;

  const submit = async () => {
    if (inflight.current || !exchange) return; // duplicate-submission guard
    inflight.current = true;
    setSubmitting(true);
    setConfirmOpen(false);
    const title = `${side === "long" ? "Long" : "Short"} ${check.sizeStr} ${market.base} ${type === "market" ? "market" : "@ " + pxStr}`;
    const id = push({ title, state: "pending", detail: "Signing…" });
    try {
      update(id, { state: "submitted", detail: "Sent to Hyperliquid" });
      const legs = await placeOrder(exchange, {
        market, side, type, tif, size: sz, limitPx, refPx, slippage, reduceOnly,
        tpPx: tpsl ? Number(tpStr) || undefined : undefined, slPx: tpsl ? Number(slStr) || undefined : undefined,
      });
      reportLegs(id, legs);
      if (legs[0]?.state === "filled" || legs[0]?.state === "open" || legs[0]?.state === "partial") {
        setSizeStr(""); setTpStr(""); setSlStr("");
      }
    } catch (e) {
      logError("placeOrder", e);
      update(id, { state: "failed", detail: humanizeError(e) });
    } finally {
      inflight.current = false;
      setSubmitting(false);
      refreshAsset();
    }
  };

  const reportLegs = (id: string, legs: LegResult[]) => {
    const [main, ...rest] = legs;
    const detail = [
      main.state === "filled" || main.state === "partial" ? `Filled ${main.filledSz} @ ${main.avgPx}` : main.error ?? (main.state === "open" ? "Resting on the book" : ""),
      ...rest.map((l) => `${l.label}: ${l.state}${l.error ? ` (${l.error})` : ""}`),
    ].filter(Boolean).join(" · ");
    update(id, { state: main.state, detail: main.error ? humanizeError(main.error) + (rest.length ? " · " + detail : "") : detail, oid: main.oid });
  };

  const setPct = (pct: number) => {
    if (maxSize == null) return;
    const base = (maxSize * pct) / 100;
    setSizeStr(sizeUnit === "base" ? String(Number(base.toFixed(market.szDecimals))) : (base * pxForSize).toFixed(2));
  };

  return (
    <div className="panel flex flex-col text-xs">
      <div className="grid grid-cols-2 gap-1 p-2">
        <button onClick={() => setSide("long")} className={clsx("py-2 rounded font-semibold transition-colors", side === "long" ? "bg-long text-black" : "bg-raised text-muted hover:text-fg")}>Long</button>
        <button onClick={() => setSide("short")} className={clsx("py-2 rounded font-semibold transition-colors", side === "short" ? "bg-short text-white" : "bg-raised text-muted hover:text-fg")}>Short</button>
      </div>

      <div className="flex items-center gap-2 px-2">
        {(["market", "limit"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)} className={clsx("px-2 py-1 rounded capitalize", type === t ? "text-fg bg-raised" : "text-muted hover:text-fg")}>{t}</button>
        ))}
        <div className="flex-1" />
        <button onClick={() => setLevOpen(true)} disabled={!isConnected}
          className="rounded border border-line-2 px-2 py-1 hover:border-accent/50 disabled:opacity-50" title="Margin mode & leverage">
          <span className="capitalize text-muted">{marginType}</span> <span className="num text-accent">{leverage}x</span>
        </button>
      </div>

      <div className="flex flex-col gap-2 p-2">
        <div className="flex justify-between text-muted">
          <span>Available to trade</span>
          <span className="num text-fg">{available != null ? fmtUsd(available) : isConnected ? <Spinner /> : "--"}</span>
        </div>
        {position && (
          <div className="flex justify-between text-muted">
            <span>Current position</span>
            <span className={clsx("num", position.side === "long" ? "text-long" : "text-short")}>{position.szi} {market.base}</span>
          </div>
        )}

        {type === "limit" && (
          <Field label="Price (USD)">
            <input inputMode="decimal" value={pxStr} onChange={(e) => setPxStr(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="num flex-1 bg-transparent outline-none" />
            <button className="text-accent text-[11px]" onClick={() => refPx && setPxStr(roundPrice(refPx, market.szDecimals))}>Mid</button>
          </Field>
        )}

        <Field label="Size">
          <input inputMode="decimal" value={sizeStr} onChange={(e) => setSizeStr(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className="num flex-1 bg-transparent outline-none" />
          <button className="text-muted hover:text-fg text-[11px]" onClick={() => { setSizeUnit((u) => (u === "usd" ? "base" : "usd")); setSizeStr(""); }}>
            {sizeUnit === "usd" ? "USD" : market.base} ⇄
          </button>
        </Field>
        <div className="flex justify-between text-faint">
          <span>{sizeUnit === "usd" ? `≈ ${check.sizeStr} ${market.base}` : `≈ ${fmtUsd(sz * pxForSize)}`}</span>
          <span>Lot {(10 ** -market.szDecimals).toFixed(market.szDecimals)}</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[25, 50, 75, 100].map((p) => (
            <button key={p} onClick={() => setPct(p)} disabled={maxSize == null}
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
          {type === "limit" ? (
            <select value={tif} onChange={(e) => setTif(e.target.value as typeof tif)} className="ml-auto bg-panel-2 border border-line-2 rounded px-1 py-0.5 text-muted">
              <option value="Gtc">GTC</option><option value="Ioc">IOC</option><option value="Alo">Post only</option>
            </select>
          ) : (
            <label className="ml-auto flex items-center gap-1 text-muted">
              Slippage
              <select value={slippage} onChange={(e) => setSlippage(Number(e.target.value))} className="bg-panel-2 border border-line-2 rounded px-1 py-0.5">
                {[0.001, 0.003, 0.005, 0.01, 0.02, 0.05].map((v) => <option key={v} value={v}>{(v * 100).toFixed(1)}%</option>)}
              </select>
            </label>
          )}
        </div>

        {tpsl && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Take profit">
              <input inputMode="decimal" value={tpStr} onChange={(e) => setTpStr(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Price" className="num w-full bg-transparent outline-none" />
            </Field>
            <Field label="Stop loss">
              <input inputMode="decimal" value={slStr} onChange={(e) => setSlStr(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Price" className="num w-full bg-transparent outline-none" />
            </Field>
            <RoeHint price={Number(tpStr)} entry={entryPx} side={side} lev={leverage} />
            <RoeHint price={Number(slStr)} entry={entryPx} side={side} lev={leverage} />
          </div>
        )}

        <div className="flex flex-col gap-1 rounded border border-line bg-panel-2 p-2 mt-1">
          <Row k={type === "market" ? "Est. entry price" : "Entry price"} v={fmtPx(entryPx || null, market.szDecimals)} />
          {worstPx && <Row k={`Worst price (${(slippage * 100).toFixed(1)}% slip)`} v={fmtPx(worstPx, market.szDecimals)} />}
          <Row k="Position value" v={fmtUsd(check.notional || 0)} />
          <Row k="Required margin" v={fmtUsd(Number.isFinite(check.margin) ? check.margin : 0)} />
          <Row k={`Est. fee (${crosses ? "taker" : "maker"} ${(feeRate * 100).toFixed(4)}%)`} v={fmtUsd(fee, 4)} />
          <Row k="Est. liquidation price" v={reduceOnly ? "--" : <span className="text-warn">{fmtPx(liqPx, market.szDecimals)}</span>} />
        </div>

        {sizeInput > 0 && check.errors.length > 0 && (
          <ul className="text-short flex flex-col gap-0.5">{check.errors.map((e) => <li key={e}>• {e}</li>)}</ul>
        )}
        {sizeInput > 0 && warnings.length > 0 && (
          <ul className="text-warn flex flex-col gap-0.5">{warnings.map((w) => <li key={w}>• {w}</li>)}</ul>
        )}

        {blocker === "connect" ? (
          <Button variant="accent" className="w-full py-2.5" onClick={() => window.dispatchEvent(new Event("elyperp:connect"))}>Connect wallet to trade</Button>
        ) : blocker === "loading" ? (
          <Button className="w-full py-2.5" disabled><Spinner /> Loading account…</Button>
        ) : blocker === "enable" ? (
          <Button variant="accent" className="w-full py-2.5" onClick={() => window.dispatchEvent(new Event("elyperp:onboard"))}>
            {agentStatus === "checking" ? "Checking trading key…" : "Set up account to trade"}
          </Button>
        ) : (
          <Button variant={side} className="w-full py-2.5 font-semibold" disabled={submitting || check.errors.length > 0} onClick={() => setConfirmOpen(true)}>
            {submitting ? <Spinner /> : `${side === "long" ? "Buy / Long" : "Sell / Short"} ${market.base}`}
          </Button>
        )}
        {address && accountLoaded && !dexState && market.dex && (
          <p className="text-faint">No balance on the {market.dexFullName} dex yet ({market.collateral} collateral). See account setup.</p>
        )}
      </div>

      <LeverageModal open={levOpen} onClose={() => setLevOpen(false)} market={market} current={leverage} currentType={marginType}
        onDone={refreshAsset} hasPosition={!!position} />

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm order">
        <div className="flex flex-col gap-1.5 text-xs">
          <Row k="Market" v={<span className="num">{market.coin}</span>} />
          <Row k="Side" v={<span className={side === "long" ? "text-long" : "text-short"}>{side.toUpperCase()}{reduceOnly ? " (reduce only)" : ""}</span>} />
          <Row k="Type" v={type === "market" ? `Market (IOC, max ${(slippage * 100).toFixed(1)}% slippage)` : `Limit ${tif === "Alo" ? "post-only" : tif}`} />
          <Row k="Size" v={`${check.sizeStr} ${market.base}`} />
          <Row k="Price" v={type === "market" ? `≈ ${fmtPx(entryPx, market.szDecimals)} (worst ${fmtPx(worstPx, market.szDecimals)})` : fmtPx(limitPx, market.szDecimals)} />
          <Row k="Leverage" v={`${leverage}x ${marginType}`} />
          <Row k="Margin" v={fmtUsd(check.margin)} />
          <Row k="Est. fee" v={fmtUsd(fee, 4)} />
          <Row k="Est. liquidation" v={fmtPx(liqPx, market.szDecimals)} />
          {tpsl && Number(tpStr) > 0 && <Row k="Take profit" v={tpStr} />}
          {tpsl && Number(slStr) > 0 && <Row k="Stop loss" v={slStr} />}
          {warnings.length > 0 && <ul className="text-warn mt-1">{warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant={side} onClick={submit} disabled={submitting}>Confirm</Button>
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

function RoeHint({ price, entry, side, lev }: { price: number; entry: number; side: Side; lev: number }) {
  if (!(price > 0) || !(entry > 0)) return <span />;
  const r = ((price - entry) / entry) * (side === "long" ? 1 : -1) * lev;
  return <span className={clsx("num text-[11px]", r >= 0 ? "text-long" : "text-short")}>ROE {(r * 100).toFixed(1)}%</span>;
}

export function LeverageModal({ open, onClose, market, current, currentType, onDone, hasPosition }: {
  open: boolean; onClose: () => void; market: Market; current: number; currentType: "cross" | "isolated"; onDone: () => void; hasPosition: boolean;
}) {
  const { exchange, status } = useTrading();
  const [lev, setLev] = useState(current);
  const [mode, setMode] = useState(currentType);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setLev(current); setMode(currentType); setErr(null); } }, [open, current, currentType]);

  const save = async () => {
    if (!exchange) return;
    setBusy(true);
    setErr(null);
    try {
      await updateLeverage(exchange, market, lev, mode === "cross");
      useToasts.getState().push({ title: `${market.base} leverage set to ${lev}x ${mode}`, state: "success" });
      onDone();
      onClose();
    } catch (e) {
      logError("updateLeverage", e);
      setErr(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`${market.base} margin & leverage`}>
      <div className="flex flex-col gap-4 text-xs">
        <div className="grid grid-cols-2 gap-1">
          {(["cross", "isolated"] as const).map((m) => (
            <button key={m} disabled={m === "cross" && market.isolatedOnly} onClick={() => setMode(m)}
              className={clsx("py-2 rounded capitalize disabled:opacity-30", mode === m ? "bg-accent/10 text-accent border border-accent/40" : "bg-raised text-muted")}>
              {m}
            </button>
          ))}
        </div>
        {market.isolatedOnly && <p className="text-warn">This market supports isolated margin only.</p>}
        <div>
          <div className="flex justify-between mb-2"><span className="text-muted">Leverage</span><span className="num text-accent text-sm">{lev}x</span></div>
          <input type="range" min={1} max={market.maxLeverage} step={1} value={lev} onChange={(e) => setLev(Number(e.target.value))} className="w-full" />
          <div className="flex justify-between text-faint mt-1"><span>1x</span><span>{market.maxLeverage}x max</span></div>
        </div>
        {lev >= Math.min(20, market.maxLeverage) && lev > 5 && <p className="text-warn">High leverage increases liquidation risk.</p>}
        {hasPosition && <p className="text-faint">You have an open position. Hyperliquid may reject lowering leverage or switching margin mode if it would leave the position under-margined.</p>}
        {err && <p className="text-short">{err}</p>}
        <Button variant="accent" onClick={save} disabled={busy || status !== "ready"}>
          {status !== "ready" ? "Enable trading first" : busy ? "Updating…" : "Confirm"}
        </Button>
      </div>
    </Modal>
  );
}
