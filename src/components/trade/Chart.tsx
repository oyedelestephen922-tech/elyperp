"use client";
import clsx from "clsx";
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart,
  type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWS } from "@orderly.network/hooks";
import { getTimestamp } from "@orderly.network/utils";
import { logError } from "@/lib/errors";
import { Spinner } from "@/components/ui/primitives";

// [label, seconds, Orderly /tv/history resolution, live kline topic suffix]
const INTERVALS = [
  ["1m", 60, "1", "1m"], ["5m", 300, "5", "5m"], ["15m", 900, "15", "15m"], ["30m", 1800, "30", "30m"],
  ["1H", 3600, "60", "1h"], ["1D", 86400, "1D", "1d"], ["1W", 604800, "1W", "1w"],
] as const;
type Interval = (typeof INTERVALS)[number][0];

interface Candle { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number }
export interface ChartLine { price: number; color: string; title: string; dashed?: boolean }

type RawCandle = { t: number; o: number; h: number; l: number; c: number; v: number };
const toCandle = (c: RawCandle): Candle => ({
  time: c.t as UTCTimestamp, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v,
});

async function fetchCandles(symbol: string, resolution: string, fromSec: number, toSec: number): Promise<RawCandle[]> {
  const qs = new URLSearchParams({ symbol, resolution, from: String(Math.floor(fromSec)), to: String(Math.floor(toSec)) });
  const r = await fetch(`/api/candles?${qs}`);
  if (!r.ok) throw new Error(`candles ${r.status}`);
  return r.json();
}

function sma(data: Candle[], n: number) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  let sum = 0;
  data.forEach((d, i) => {
    sum += d.close;
    if (i >= n) sum -= data[i - n].close;
    if (i >= n - 1) out.push({ time: d.time, value: sum / n });
  });
  return out;
}
function ema(data: Candle[], n: number) {
  const k = 2 / (n + 1);
  const out: { time: UTCTimestamp; value: number }[] = [];
  let prev: number | null = null;
  data.forEach((d, i) => {
    prev = prev == null ? d.close : d.close * k + prev * (1 - k);
    if (i >= n - 1) out.push({ time: d.time, value: prev });
  });
  return out;
}

export function Chart({ symbol, pricePrecision, lines }: { symbol: string; pricePrecision: number; lines: ChartLine[] }) {
  const ws = useWS();
  const wrapRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const dataRef = useRef<Candle[]>([]);
  const linesRef = useRef<IPriceLine[]>([]);
  const drawingsRef = useRef<IPriceLine[]>([]);
  const loadingOlder = useRef(false);
  const exhausted = useRef(false);
  const drawMode = useRef(false);

  const [interval, setIntervalState] = useState<Interval>("15m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showVol, setShowVol] = useState(true);
  const [showMa, setShowMa] = useState(false);
  const [showEma, setShowEma] = useState(false);
  const [drawing, setDrawing] = useState(false);

  const refreshIndicators = useCallback(() => {
    const d = dataRef.current;
    maRef.current?.setData(showMa ? sma(d, 20) : []);
    emaRef.current?.setData(showEma ? ema(d, 50) : []);
  }, [showMa, showEma]);

  // Create chart once
  useEffect(() => {
    if (!elRef.current) return;
    const chart = createChart(elRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0a0e0c" }, textColor: "#7c8a84", fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: "#121815" }, horzLines: { color: "#121815" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1b2320" },
      timeScale: { borderColor: "#1b2320", timeVisible: true, secondsVisible: false },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#18d98b", downColor: "#f2495e", borderVisible: false, wickUpColor: "#18d98b", wickDownColor: "#f2495e",
    });
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const ma = chart.addSeries(LineSeries, { color: "#f2b84b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const em = chart.addSeries(LineSeries, { color: "#6aa7ff", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    chartRef.current = chart;
    candleRef.current = candles;
    volRef.current = vol;
    maRef.current = ma;
    emaRef.current = em;

    chart.subscribeClick((p) => {
      if (!drawMode.current || !p.point) return;
      const price = candles.coordinateToPrice(p.point.y);
      if (price == null) return;
      drawingsRef.current.push(candles.createPriceLine({ price, color: "#9aa8a2", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "" }));
      drawMode.current = false;
      setDrawing(false);
    });
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    candleRef.current?.applyOptions({ priceFormat: { type: "price", precision: pricePrecision, minMove: 1 / 10 ** pricePrecision } });
  }, [pricePrecision]);

  useEffect(() => {
    volRef.current?.applyOptions({ visible: showVol });
  }, [showVol]);
  useEffect(refreshIndicators, [refreshIndicators]);

  // Load history + live stream whenever the market or interval changes
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleRef.current;
    const vol = volRef.current;
    if (!chart || !series || !vol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    exhausted.current = false;
    dataRef.current = [];
    series.setData([]);
    vol.setData([]);
    drawingsRef.current.forEach((l) => series.removePriceLine(l));
    drawingsRef.current = [];
    const [, secs, resolution, klineType] = INTERVALS.find((i) => i[0] === interval)!;
    const volData = (d: Candle[]) => d.map((c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? "#18d98b55" : "#f2495e55" }));
    const nowSec = () => Math.floor(Date.now() / 1000);

    fetchCandles(symbol, resolution, nowSec() - secs * 1500, nowSec() + secs)
      .then((raw) => {
        if (cancelled) return;
        const d = raw.map(toCandle);
        dataRef.current = d;
        series.setData(d);
        vol.setData(volData(d));
        refreshIndicators();
        chart.timeScale().fitContent();
        if (d.length > 150) chart.timeScale().setVisibleLogicalRange({ from: d.length - 150, to: d.length + 5 });
        if (!d.length) setError("No candle history for this market yet.");
      })
      .catch((e) => {
        logError("candles", e);
        if (!cancelled) setError("Couldn't load candles from Orderly.");
      })
      .finally(() => !cancelled && setLoading(false));

    // Lazy-load older candles when the user scrolls to the left edge
    const onRange = (range: { from: number; to: number } | null) => {
      if (!range || range.from > 10 || loadingOlder.current || exhausted.current || !dataRef.current.length) return;
      loadingOlder.current = true;
      const oldest = dataRef.current[0].time;
      fetchCandles(symbol, resolution, oldest - secs * 1000, oldest - 1)
        .then((raw) => {
          if (cancelled) return;
          const older = raw.map(toCandle).filter((c) => c.time < dataRef.current[0].time);
          if (!older.length) { exhausted.current = true; return; }
          dataRef.current = [...older, ...dataRef.current];
          series.setData(dataRef.current);
          vol.setData(volData(dataRef.current));
          refreshIndicators();
        })
        .catch((e) => logError("older candles", e))
        .finally(() => (loadingOlder.current = false));
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    // Live candle for the current bucket
    const topic = `${symbol}@kline_${klineType}`;
    const unsubscribe = ws.subscribe(
      { id: topic, event: "subscribe", topic, ts: getTimestamp() },
      {
        onMessage: (k: { symbol: string; open: number; high: number; low: number; close: number; volume: number; startTime: number }) => {
          if (cancelled || k.symbol !== symbol) return;
          const bar: Candle = { time: Math.floor(k.startTime / 1000) as UTCTimestamp, open: +k.open, high: +k.high, low: +k.low, close: +k.close, volume: +k.volume };
          const d = dataRef.current;
          const last = d[d.length - 1];
          if (last && bar.time < last.time) return;
          if (last && bar.time === last.time) d[d.length - 1] = bar;
          else d.push(bar);
          series.update(bar);
          vol.update({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? "#18d98b55" : "#f2495e55" });
        },
      },
    );
    return () => {
      cancelled = true;
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      unsubscribe?.();
    };
  }, [symbol, interval, refreshIndicators, ws]);

  // Position / order overlays
  useEffect(() => {
    const s = candleRef.current;
    if (!s) return;
    linesRef.current.forEach((l) => s.removePriceLine(l));
    linesRef.current = lines
      .filter((l) => l.price > 0)
      .map((l) => s.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: true, title: l.title }));
  }, [lines]);

  const toggleFull = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  return (
    <div ref={wrapRef} className="flex flex-col h-full min-h-0 bg-panel">
      <div className="flex items-center gap-1 px-2 h-9 border-b border-line text-xs overflow-x-auto scroll-thin">
        {INTERVALS.map(([iv]) => (
          <button key={iv} onClick={() => setIntervalState(iv)}
            className={clsx("px-2 py-1 rounded", interval === iv ? "text-accent bg-accent/10" : "text-muted hover:text-fg")}>
            {iv}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line-2" />
        <Toggle on={showVol} onClick={() => setShowVol((v) => !v)}>Vol</Toggle>
        <Toggle on={showMa} onClick={() => setShowMa((v) => !v)}>MA20</Toggle>
        <Toggle on={showEma} onClick={() => setShowEma((v) => !v)}>EMA50</Toggle>
        <span className="mx-1 h-4 w-px bg-line-2" />
        <Toggle on={drawing} onClick={() => { drawMode.current = !drawing; setDrawing(!drawing); }} title="Click the chart to place a horizontal line">
          ─ Line
        </Toggle>
        <button className="px-2 py-1 text-muted hover:text-fg" onClick={() => {
          const s = candleRef.current; if (!s) return;
          drawingsRef.current.forEach((l) => s.removePriceLine(l)); drawingsRef.current = [];
        }}>Clear</button>
        <div className="flex-1" />
        {loading && <Spinner />}
        <button className="px-2 py-1 text-muted hover:text-fg" onClick={toggleFull} title="Full screen">⛶</button>
      </div>
      <div className="relative flex-1 min-h-0">
        <div ref={elRef} className="absolute inset-0" />
        {error && <div className="absolute inset-0 grid place-items-center text-xs text-muted pointer-events-none">{error}</div>}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button title={title} onClick={onClick} className={clsx("px-2 py-1 rounded whitespace-nowrap", on ? "text-fg bg-raised" : "text-faint hover:text-fg")}>
      {children}
    </button>
  );
}
