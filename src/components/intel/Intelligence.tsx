"use client";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Empty, Spinner, Tabs } from "@/components/ui/primitives";
import { fmtCompact, shortAddr } from "@/lib/format";
import {
  chainName, isEvm, looksLikeAddress, readNdjson, tierInfo,
  type DetectResponse, type HistoryPoint, type LiveEvent, type Rank, type RankRow, type Report, type ReportLine, type ReportResponse, type StepLine,
} from "@/lib/intel/agentsi";
import { compare, latestPerToken, snapshotOf, useIntelHistory, type Change } from "@/lib/intel/history";
import { ReportView, type Freshness } from "./ReportView";

const STEP_LABELS: Record<string, string> = {
  validate: "Validating address", market: "Reading markets", mint: "Reading the contract", holders: "Indexing holders",
  history: "Checking history", memory: "Checking SI memory", rules: "Running security rules", verdict: "Writing verdict", publish: "Saving report",
};

type Phase =
  | { kind: "idle" }
  | { kind: "detecting"; address: string }
  | { kind: "choose"; address: string; options: string[]; message: string }
  | { kind: "scanning"; address: string; chain?: string; force: boolean; steps: StepLine[] }
  | { kind: "error"; address?: string; message: string; options?: string[] };

interface Shown {
  report: Report;
  rank?: Rank | null;
  freshness: Freshness;
  history?: HistoryPoint[] | null;
  changes?: { since: string; list: Change[] } | null;
}

async function jsonOrError<T>(r: Response): Promise<T> {
  let body: Record<string, unknown> = {};
  try {
    body = await r.json();
  } catch {
    /* empty */
  }
  if (!r.ok) {
    const err = new Error(typeof body.error === "string" ? body.error : `Request failed (${r.status}).`) as Error & { body?: unknown; status?: number };
    err.body = body;
    err.status = r.status;
    throw err;
  }
  return body as T;
}

export function Intelligence() {
  const router = useRouter();
  const params = useSearchParams();
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [shown, setShown] = useState<Shown | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const record = useIntelHistory((s) => s.record);
  const initHistory = useIntelHistory((s) => s.init);

  useEffect(() => initHistory(), [initHistory]);

  const show = useCallback((report: Report, rank: Rank | null | undefined, freshness: Freshness, history?: HistoryPoint[] | null) => {
    const prior = record(report);
    const changes = prior ? { since: prior.createdAt, list: compare(prior, snapshotOf(report)) } : null;
    setShown({ report, rank, freshness, history, changes });
    router.replace(`/intelligence?address=${encodeURIComponent(report.address)}&chain=${encodeURIComponent(report.chain)}`, { scroll: false });
    setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [record, router]);

  /** Agent SI's history for the token, fetched after a scan (no new scan). */
  const loadHistory = useCallback(async (address: string, chain: string) => {
    try {
      const d = await jsonOrError<ReportResponse>(await fetch(`/api/intel/report?address=${encodeURIComponent(address)}&chain=${encodeURIComponent(chain)}`));
      setShown((s) => (s && s.report.address === address && s.report.chain === chain ? { ...s, history: d.history ?? null } : s));
    } catch {
      /* history is optional */
    }
  }, []);

  const scan = useCallback(async (address: string, chain?: string, force = false) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase({ kind: "scanning", address, chain, force, steps: [] });
    const qs = new URLSearchParams({ address });
    if (chain) qs.set("chain", chain);
    if (force) qs.set("force", "1");
    try {
      const r = await fetch(`/api/intel/scan?${qs}`, { signal: ac.signal });
      const type = r.headers.get("content-type") ?? "";
      if (!r.ok || !type.includes("ndjson") || !r.body) {
        const body = (await r.json().catch(() => ({}))) as { error?: string; detect?: DetectResponse | null };
        const options = body.detect?.options ?? [];
        if (r.status === 422 && options.length > 1) {
          setPhase({ kind: "choose", address, options, message: body.error ?? "This address exists on more than one chain." });
        } else {
          setPhase({ kind: "error", address, message: body.error ?? `Scan failed (${r.status}).`, options: options.length ? options : undefined });
        }
        return;
      }
      const steps = new Map<string, StepLine>();
      let final: ReportLine | null = null;
      for await (const line of readNdjson(r.body)) {
        if (line.type === "step") {
          const s = line as unknown as StepLine;
          steps.set(s.id, { ...steps.get(s.id), ...s });
          setPhase({ kind: "scanning", address, chain, force, steps: [...steps.values()] });
        } else if (line.type === "report") {
          final = line as unknown as ReportLine;
        } else if (line.type === "error") {
          throw new Error(typeof line.error === "string" ? line.error : typeof line.message === "string" ? line.message : "Agent SI reported an error during the scan.");
        }
      }
      if (!final?.report) throw new Error("The scan ended before Agent SI returned a report. It may have timed out; try again.");
      setPhase({ kind: "idle" });
      const freshness: Freshness = { kind: final.cached ? "cached" : "fresh", at: final.report.createdAt };
      show(final.report, final.rank, freshness, null);
      void loadHistory(final.report.address, final.report.chain);
    } catch (e) {
      if (ac.signal.aborted) return;
      setPhase({ kind: "error", address, message: e instanceof Error ? e.message : String(e) });
    }
  }, [show, loadHistory]);

  const analyze = useCallback(async (raw: string) => {
    const address = raw.trim();
    setShareMsg(null);
    if (!address) return;
    if (!looksLikeAddress(address)) {
      setPhase({ kind: "error", message: "That isn't a valid token address. Paste the token's contract address (0x… on EVM chains, or the mint address on Solana)." });
      return;
    }
    if (!isEvm(address)) return scan(address); // Agent SI detects non-EVM chains during the scan
    setPhase({ kind: "detecting", address });
    try {
      const d = await jsonOrError<DetectResponse>(await fetch(`/api/intel/detect?address=${encodeURIComponent(address)}`));
      if (d.chain) return scan(address, d.chain);
      if (d.options?.length > 1) {
        setPhase({ kind: "choose", address, options: d.options, message: "This address is a token on more than one chain. Pick the one you mean." });
        return;
      }
      if (d.reason === "unreachable") {
        setPhase({ kind: "error", address, message: "Agent SI couldn't reach every chain to detect this address. Try again shortly." });
        return;
      }
      // no market and no contract code on the featured chains: let the scan give Agent SI's own answer
      return scan(address);
    } catch (e) {
      setPhase({ kind: "error", address, message: e instanceof Error ? e.message : String(e) });
    }
  }, [scan]);

  /** Open the latest saved report (history, shared links). Labelled as saved, never as a fresh scan. */
  const openSaved = useCallback(async (address: string, chain: string) => {
    abortRef.current?.abort();
    setInput(address);
    setPhase({ kind: "detecting", address });
    try {
      const d = await jsonOrError<ReportResponse>(await fetch(`/api/intel/report?address=${encodeURIComponent(address)}&chain=${encodeURIComponent(chain)}`));
      setPhase({ kind: "idle" });
      show(d.report, d.rank, { kind: "saved", at: d.report.createdAt }, d.history ?? null);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return scan(address, chain);
      setPhase({ kind: "error", address, message: e instanceof Error ? e.message : String(e) });
    }
  }, [show, scan]);

  // deep link: /intelligence?address=…&chain=…
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current) return;
    const a = params.get("address");
    const c = params.get("chain");
    if (!a) return;
    deepLinked.current = true;
    setInput(a);
    if (c) void openSaved(a, c);
    else void analyze(a);
  }, [params, openSaved, analyze]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const share = async () => {
    if (!shown) return;
    const url = `${window.location.origin}/intelligence?address=${encodeURIComponent(shown.report.address)}&chain=${encodeURIComponent(shown.report.chain)}`;
    const text = `${shown.report.token?.symbol ?? shortAddr(shown.report.address)} on ${chainName(shown.report.chain)}: SI Score ${shown.report.score?.points ?? "?"} ${shown.report.score?.label ?? ""} (Agent SI via Elyperp)`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Elyperp Intelligence", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied");
    } catch {
      setShareMsg(url);
    }
    setTimeout(() => setShareMsg(null), 4000);
  };

  const busy = phase.kind === "detecting" || phase.kind === "scanning";

  return (
    <div className="flex flex-col">
      {/* hero + scanner */}
      <section className="relative border-b border-line overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-60 [background:radial-gradient(60%_80%_at_50%_0%,rgba(24,217,139,0.12),transparent_70%)]" />
        <div className="relative max-w-4xl mx-auto px-4 md:px-8 pt-12 pb-10 flex flex-col items-center text-center gap-3">
          <span className="text-[11px] tracking-[0.3em] text-accent">ELYPERP INTELLIGENCE</span>
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">Before you trade, know what you&apos;re trading.</h1>
          <p className="text-sm text-muted">
            Powered by <a href="https://agentsi.site" target="_blank" rel="noreferrer" className="text-fg hover:text-accent">Agent SI</a>.
            Paste any token contract address. The chain is detected for you.
          </p>
          <form
            className="w-full mt-4 flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void analyze(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Token contract address, e.g. 0x… or a Solana mint"
              spellCheck={false}
              autoComplete="off"
              className="num flex-1 rounded-md border border-line-2 bg-panel px-4 py-3.5 text-sm outline-none focus:border-accent/70 focus:shadow-[0_0_0_3px_rgba(24,217,139,0.15)]"
            />
            <Button type="submit" variant="accent" className="px-6 py-3.5 font-semibold tracking-wide" disabled={busy || !input.trim()}>
              {busy ? <Spinner /> : "ANALYZE CONTRACT"}
            </Button>
          </form>
          <p className="text-[11px] text-faint">No wallet needed. Elyperp never asks for keys or signatures to scan a token.</p>
        </div>
      </section>

      <div className="max-w-6xl w-full mx-auto px-4 md:px-8 py-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4 min-w-0" ref={reportRef}>
          <PhaseView phase={phase} onPick={(c) => phase.kind === "choose" || phase.kind === "error" ? scan(phase.address!, c) : undefined} onCancel={() => { abortRef.current?.abort(); setPhase({ kind: "idle" }); }} />
          {shown && phase.kind !== "scanning" && (
            <>
              {shareMsg && <p className="text-xs text-accent break-all">{shareMsg}</p>}
              <ReportView
                report={shown.report}
                rank={shown.rank}
                freshness={shown.freshness}
                history={shown.history}
                changes={shown.changes}
                refreshing={busy}
                onRefresh={() => scan(shown.report.address, shown.report.chain, true)}
                onShare={share}
              />
            </>
          )}
          {!shown && phase.kind === "idle" && <RankBoard onOpen={openSaved} />}
        </div>
        <aside className="flex flex-col gap-4 min-w-0">
          <HistoryPanel onOpen={openSaved} />
          <LiveFeed onOpen={openSaved} />
        </aside>
      </div>
    </div>
  );
}

function PhaseView({ phase, onPick, onCancel }: { phase: Phase; onPick: (chain: string) => void; onCancel: () => void }) {
  if (phase.kind === "idle") return null;
  if (phase.kind === "detecting") {
    return <div className="panel p-5 flex items-center gap-3 text-sm text-muted"><Spinner /> Finding the chain for <span className="num text-fg">{shortAddr(phase.address)}</span>…</div>;
  }
  if (phase.kind === "choose" || (phase.kind === "error" && phase.options?.length)) {
    const options = phase.kind === "choose" ? phase.options : phase.options ?? [];
    return (
      <div className="panel p-5 flex flex-col gap-3">
        <p className="text-sm text-fg">{phase.kind === "choose" ? phase.message : phase.message}</p>
        <div className="flex flex-wrap gap-2">
          {options.map((c) => <Button key={c} onClick={() => onPick(c)} className="!py-1.5 text-xs">{chainName(c)}</Button>)}
        </div>
      </div>
    );
  }
  if (phase.kind === "error") {
    return <div className="panel p-5 border-short/40 text-sm text-short">{phase.message}</div>;
  }
  // scanning
  const order = Object.keys(STEP_LABELS);
  const pos = (id: string) => (order.indexOf(id) < 0 ? 99 : order.indexOf(id));
  const steps = [...phase.steps].sort((a, b) => pos(a.id) - pos(b.id));
  const done = steps.filter((s) => s.status === "done").length;
  return (
    <div className="panel p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <Spinner />
          <span className="text-fg">{phase.force ? "Running a fresh scan" : "Scanning"} <span className="num">{shortAddr(phase.address)}</span>{phase.chain ? ` on ${chainName(phase.chain)}` : ""}…</span>
        </div>
        <button onClick={onCancel} className="text-xs text-muted hover:text-fg">Cancel</button>
      </div>
      <div className="h-1 rounded-full bg-raised overflow-hidden">
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.min(100, (done / Math.max(order.length, steps.length)) * 100)}%` }} />
      </div>
      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <span className={clsx("h-1.5 w-1.5 rounded-full shrink-0", s.status === "done" ? "bg-accent" : s.status === "error" ? "bg-short" : "bg-warn animate-pulse")} />
            <span className="text-muted">{STEP_LABELS[s.id] ?? s.id}</span>
            {s.detail && <span className="text-faint truncate">· {s.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryPanel({ onOpen }: { onOpen: (address: string, chain: string) => void }) {
  const list = useIntelHistory((s) => s.list);
  const remove = useIntelHistory((s) => s.remove);
  const clear = useIntelHistory((s) => s.clear);
  const items = latestPerToken(list);
  return (
    <div className="panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <span className="text-sm font-semibold">Your scans</span>
        {items.length > 0 && <button onClick={clear} className="text-[11px] text-faint hover:text-muted">Clear</button>}
      </div>
      {!items.length ? (
        <Empty>Tokens you scan appear here, saved in this browser.</Empty>
      ) : (
        <ul className="max-h-80 overflow-y-auto scroll-thin">
          {items.map((s) => {
            const t = tierInfo(s.tier ?? undefined);
            const count = list.filter((x) => x.chain === s.chain && x.address.toLowerCase() === s.address.toLowerCase()).length;
            return (
              <li key={`${s.chain}:${s.address}`} className="border-t border-line first:border-t-0 group">
                <button onClick={() => onOpen(s.address, s.chain)} className="w-full text-left px-4 py-2.5 hover:bg-panel-2 flex items-center gap-3">
                  <span className="num text-lg w-9 text-right" style={{ color: t.color }}>{s.points ?? "--"}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{s.symbol ?? shortAddr(s.address)} <span className="text-faint text-xs">· {chainName(s.chain)}</span></span>
                    <span className="block text-[11px] text-faint">{new Date(s.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}{count > 1 ? ` · ${count} scans saved` : ""}</span>
                  </span>
                  <span role="button" tabIndex={0} aria-label="Remove" onClick={(e) => { e.stopPropagation(); remove(s.address, s.chain); }}
                    className="text-faint hover:text-short opacity-0 group-hover:opacity-100 text-xs">×</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const LIVE_TABS = [
  { value: "all", label: "All" },
  { value: "analysis", label: "Scans" },
  { value: "signal", label: "Signals" },
  { value: "liquidity-change", label: "Liquidity" },
] as const;
type LiveTab = (typeof LIVE_TABS)[number]["value"];

function LiveFeed({ onOpen }: { onOpen: (address: string, chain: string) => void }) {
  const [tab, setTab] = useState<LiveTab>("all");
  const [events, setEvents] = useState<LiveEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    const load = async () => {
      try {
        const d = await jsonOrError<{ events: LiveEvent[]; at?: string }>(await fetch(`/api/intel/live?limit=30${tab === "all" ? "" : `&type=${tab}`}`));
        if (cancelled) return;
        setEvents(d.events ?? []);
        setAt(d.at ?? null);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tab]);

  return (
    <div className="panel">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="text-sm font-semibold flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />Live intelligence</span>
        {at && <span className="text-[10px] text-faint">updated {new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      <Tabs value={tab} onChange={setTab} items={[...LIVE_TABS]} className="px-2 border-b border-line" />
      {error && !events ? (
        <Empty>{error}</Empty>
      ) : !events ? (
        <div className="grid place-items-center py-8"><Spinner /></div>
      ) : !events.length ? (
        <Empty>No recent activity of this type.</Empty>
      ) : (
        <ul className="max-h-[520px] overflow-y-auto scroll-thin">
          {events.map((e) => (
            <li key={e.id} className="border-t border-line first:border-t-0">
              <button disabled={!e.subject} onClick={() => e.subject && onOpen(e.subject.address, e.subject.chain)} className="w-full text-left px-4 py-2.5 hover:bg-panel-2">
                <div className="flex items-center gap-2 text-[11px]">
                  <Badge tone={e.type === "analysis" ? "accent" : e.type === "liquidity-change" ? "warn" : "default"}>{e.type.replace("-", " ")}</Badge>
                  {e.subject && <span className="text-fg">{e.subject.symbol ?? shortAddr(e.subject.address)}</span>}
                  {e.subject && <span className="text-faint">{chainName(e.subject.chain)}</span>}
                  <span className="ml-auto text-faint">{timeAgo(e.at)}</span>
                </div>
                <p className="text-xs text-muted mt-1 leading-relaxed">{e.summary}</p>
                {e.source && <p className="text-[10px] text-faint mt-0.5 truncate">Source: {e.source}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function timeAgo(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

function RankBoard({ onOpen }: { onOpen: (address: string, chain: string) => void }) {
  const [chain, setChain] = useState("robinhood");
  const [data, setData] = useState<{ rows: RankRow[]; chains?: { chain: string; tokens: number }[]; at?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    fetch(`/api/intel/rank?chain=${chain}&limit=15`)
      .then((r) => jsonOrError<{ rows: RankRow[]; chains?: { chain: string; tokens: number }[]; at?: string }>(r))
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [chain]);
  return (
    <div className="panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-line">
        <div>
          <div className="text-sm font-semibold">SI Score board</div>
          <div className="text-[11px] text-faint">Highest-scoring tokens Agent SI has scanned. Click one to open its latest report.</div>
        </div>
        <select value={chain} onChange={(e) => setChain(e.target.value)} className="bg-panel-2 border border-line-2 rounded px-2 py-1 text-xs text-muted">
          {(data?.chains ?? [{ chain: "robinhood", tokens: 0 }]).map((c) => <option key={c.chain} value={c.chain}>{chainName(c.chain)}{c.tokens ? ` (${c.tokens})` : ""}</option>)}
          {data?.chains && !data.chains.some((c) => c.chain === chain) && <option value={chain}>{chainName(chain)}</option>}
        </select>
      </div>
      {error ? (
        <Empty>{error}</Empty>
      ) : !data ? (
        <div className="grid place-items-center py-10"><Spinner /></div>
      ) : !data.rows.length ? (
        <Empty>No ranked tokens on this chain yet.</Empty>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] text-faint text-left"><th className="px-4 py-2 font-normal w-10">#</th><th className="py-2 font-normal">Token</th><th className="py-2 font-normal text-right">Liquidity</th><th className="py-2 font-normal text-right pr-4">SI Score</th></tr></thead>
          <tbody>
            {data.rows.map((r, i) => {
              const t = tierInfo(r.tier);
              return (
                <tr key={r.address} onClick={() => onOpen(r.address, r.chain)} className="border-t border-line hover:bg-panel-2 cursor-pointer">
                  <td className="px-4 py-2 text-faint num">{i + 1}</td>
                  <td className="py-2"><span className="text-fg">{r.symbol ?? shortAddr(r.address)}</span> <span className="text-faint text-xs">{r.name}</span></td>
                  <td className="py-2 num text-right text-muted">{r.liquidityUsd != null ? fmtCompact(r.liquidityUsd) : "--"}</td>
                  <td className="py-2 pr-4 text-right"><span className="num" style={{ color: t.color }}>{r.points}</span> <span className="text-[10px] tracking-wider" style={{ color: t.color }}>{r.label ?? t.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
