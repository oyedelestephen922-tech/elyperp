export function fmtPx(v: number | null | undefined, pxDecimals = 2) {
  if (v == null || !Number.isFinite(v)) return "--";
  return v.toLocaleString("en-US", { minimumFractionDigits: pxDecimals, maximumFractionDigits: pxDecimals });
}

export function fmtUsd(v: number | null | undefined, dec = 2) {
  if (v == null || !Number.isFinite(v)) return "--";
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtCompact(v: number | null | undefined, prefix = "$") {
  if (v == null || !Number.isFinite(v)) return "--";
  return prefix + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
}

export function fmtPct(v: number | null | undefined, dec = 2, signed = true) {
  if (v == null || !Number.isFinite(v)) return "--";
  const pct = Number((v * 100).toFixed(dec));
  const s = (pct === 0 ? 0 : pct).toFixed(dec) + "%"; // avoid "-0.00%"
  return signed && pct > 0 ? "+" + s : s;
}

export function fmtSize(v: number | null | undefined, szDecimals: number) {
  if (v == null || !Number.isFinite(v)) return "--";
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: szDecimals });
}

export function shortAddr(a?: string | null) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour12: false });
}

export function fmtDateTime(ms: number) {
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "2-digit" })} ${d.toLocaleTimeString("en-US", { hour12: false })}`;
}

export const pnlClass = (v: number | null | undefined) =>
  v == null || v === 0 ? "text-muted" : v > 0 ? "text-long" : "text-short";

export const marketPath = (slug: string) => `/trade/${encodeURIComponent(slug)}`;

/** 24h change from the rolling open; null when there is no open yet. */
export function change24(ctx: { markPx: number; open24: number } | null | undefined) {
  return ctx && ctx.open24 > 0 && ctx.markPx > 0 ? ctx.markPx / ctx.open24 - 1 : null;
}
