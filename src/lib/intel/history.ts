"use client";
import { create } from "zustand";
import type { Report } from "./agentsi";
import { fmtCompact } from "../format";

/**
 * Scans this browser has opened, kept in local storage so a visitor can reopen
 * and compare them. Only real reports go in; a comparison is shown only when an
 * older snapshot of the same token on the same chain exists.
 */

export interface Snapshot {
  address: string;
  chain: string;
  symbol: string | null;
  name: string | null;
  createdAt: string; // when Agent SI read the data
  viewedAt: string; // when it was opened here
  points: number | null;
  tier: string | null;
  label: string | null;
  liquidityUsd: number | null;
  marketCap: number | null;
  owner: string | null; // null with ownerKnown=false means not exposed / not read
  ownerKnown: boolean | null;
  flags: { id: string; severity: string; title: string }[];
  controls: Record<string, boolean | number | null>; // proxy, mintable, pausable, blacklist, buyTaxPct, sellTaxPct, tradingLimits
  top10WalletPct: number | null;
}

const KEY = "elyperp:intel:history:v1";
const MAX = 40;

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const b = (v: unknown) => (typeof v === "boolean" ? v : null);

export function snapshotOf(r: Report): Snapshot {
  const sec = r.security?.status === "ok" ? r.security.value ?? {} : {};
  const ctl = r.control?.status === "ok" ? r.control.value : null;
  const mkt = r.market?.status === "ok" ? r.market.value : null;
  const hold = r.holders?.status === "ok" ? r.holders.value : null;
  return {
    address: r.address,
    chain: r.chain,
    symbol: r.token?.symbol ?? null,
    name: r.token?.name ?? null,
    createdAt: r.createdAt,
    viewedAt: new Date().toISOString(),
    points: n(r.score?.points),
    tier: r.score?.tier ?? null,
    label: r.score?.label ?? null,
    liquidityUsd: n(mkt?.liquidityUsd),
    marketCap: n(mkt?.marketCap),
    owner: ctl ? ctl.owner ?? null : null,
    ownerKnown: ctl ? b(ctl.ownerKnown) : null,
    flags: (r.findings ?? []).filter((f) => ["critical", "high", "medium", "low"].includes(f.severity)).map((f) => ({ id: f.id, severity: f.severity, title: f.title })),
    controls: {
      proxy: b(sec.proxy), mintable: b(sec.mintable), pausable: b(sec.pausable), blacklist: b(sec.blacklist),
      tradingLimits: b(sec.tradingLimits), honeypot: b(sec.honeypot), buyTaxPct: n(sec.buyTaxPct), sellTaxPct: n(sec.sellTaxPct),
    },
    top10WalletPct: n(hold?.top10WalletPct),
  };
}

function load(): Snapshot[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function save(list: Snapshot[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage full or blocked */
  }
}

const same = (a: { address: string; chain: string }, b: { address: string; chain: string }) =>
  a.chain === b.chain && a.address.toLowerCase() === b.address.toLowerCase();

interface HistoryState {
  list: Snapshot[];
  loaded: boolean;
  init: () => void;
  /** Store a report. Returns the most recent older snapshot of the same token (for comparison), if any. */
  record: (r: Report) => Snapshot | null;
  remove: (address: string, chain: string) => void;
  clear: () => void;
}

export const useIntelHistory = create<HistoryState>((set, get) => ({
  list: [],
  loaded: false,
  init: () => {
    if (!get().loaded) set({ list: load(), loaded: true });
  },
  record: (r) => {
    const list = get().loaded ? get().list : load();
    const snap = snapshotOf(r);
    const prior = list
      .filter((s) => same(s, snap) && Date.parse(s.createdAt) < Date.parse(snap.createdAt))
      .sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt))[0] ?? null;
    // keep one entry per token+scan time; newest first
    const rest = list.filter((s) => !(same(s, snap) && s.createdAt === snap.createdAt));
    const next = [snap, ...rest].sort((x, y) => Date.parse(y.viewedAt) - Date.parse(x.viewedAt));
    // keep at most 3 snapshots per token so comparisons have something to work with
    const counts = new Map<string, number>();
    const trimmed = next.filter((s) => {
      const k = `${s.chain}:${s.address.toLowerCase()}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
      return (counts.get(k) ?? 0) <= 3;
    });
    save(trimmed);
    set({ list: trimmed, loaded: true });
    return prior;
  },
  remove: (address, chain) => {
    const list = get().list.filter((s) => !same(s, { address, chain }));
    save(list);
    set({ list });
  },
  clear: () => {
    save([]);
    set({ list: [] });
  },
}));

/** Latest snapshot per token, for the history list. */
export function latestPerToken(list: Snapshot[]) {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = `${s.chain}:${s.address.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface Change { label: string; before: string; after: string; tone: "good" | "bad" | "neutral" }

const CONTROL_LABELS: Record<string, string> = {
  proxy: "Upgradeable proxy", mintable: "Can mint", pausable: "Can pause", blacklist: "Blacklist", tradingLimits: "Trading limits",
  honeypot: "Honeypot", buyTaxPct: "Buy tax", sellTaxPct: "Sell tax",
};

/** Differences between two real snapshots. Fields missing on either side are skipped, never guessed. */
export function compare(prev: Snapshot, cur: Snapshot): Change[] {
  const out: Change[] = [];
  const usd = (v: number) => fmtCompact(v);
  if (prev.points != null && cur.points != null && prev.points !== cur.points) {
    out.push({ label: "SI Score", before: `${prev.points} ${prev.label ?? ""}`.trim(), after: `${cur.points} ${cur.label ?? ""}`.trim(), tone: cur.points > prev.points ? "good" : "bad" });
  }
  if (prev.liquidityUsd != null && cur.liquidityUsd != null && prev.liquidityUsd > 0) {
    const pct = ((cur.liquidityUsd - prev.liquidityUsd) / prev.liquidityUsd) * 100;
    if (Math.abs(pct) >= 1) out.push({ label: "Liquidity", before: usd(prev.liquidityUsd), after: `${usd(cur.liquidityUsd)} (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%)`, tone: pct > 0 ? "good" : "bad" });
  }
  if (prev.ownerKnown != null && cur.ownerKnown != null && (prev.owner ?? "") !== (cur.owner ?? "")) {
    out.push({ label: "Owner", before: prev.owner ?? "not exposed", after: cur.owner ?? "not exposed", tone: "neutral" });
  }
  for (const k of Object.keys(CONTROL_LABELS)) {
    const a = prev.controls[k];
    const c = cur.controls[k];
    if (a == null || c == null || a === c) continue;
    const fmt = (v: boolean | number) => (typeof v === "number" ? `${v}%` : v ? "Yes" : "No");
    const worse = typeof c === "number" ? c > (a as number) : c === true;
    out.push({ label: CONTROL_LABELS[k], before: fmt(a), after: fmt(c), tone: worse ? "bad" : "good" });
  }
  if (prev.top10WalletPct != null && cur.top10WalletPct != null && Math.abs(cur.top10WalletPct - prev.top10WalletPct) >= 1) {
    out.push({ label: "Top 10 wallets", before: `${prev.top10WalletPct.toFixed(1)}%`, after: `${cur.top10WalletPct.toFixed(1)}%`, tone: cur.top10WalletPct > prev.top10WalletPct ? "bad" : "good" });
  }
  const before = new Set(prev.flags.map((f) => f.id));
  const after = new Set(cur.flags.map((f) => f.id));
  for (const f of cur.flags) if (!before.has(f.id)) out.push({ label: "New finding", before: "-", after: `${f.title} (${f.severity})`, tone: "bad" });
  for (const f of prev.flags) if (!after.has(f.id)) out.push({ label: "Finding cleared", before: `${f.title} (${f.severity})`, after: "-", tone: "good" });
  return out;
}
