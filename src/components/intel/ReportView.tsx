"use client";
import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { fmtCompact, fmtPct, shortAddr } from "@/lib/format";
import {
  SEVERITY_ORDER, agentsiReportUrl, chainName, clipText, evidenceKind, isFlag, isMissing, severityTone, sourceOf, tierInfo, yesNo,
  type Finding, type HistoryPoint, type Rank, type Report, type Sourced,
} from "@/lib/intel/agentsi";
import type { Change } from "@/lib/intel/history";
import { reportHash, type OnchainRecord } from "@/lib/intel/registry";

export type Freshness = { kind: "fresh" | "cached" | "saved"; at: string };

const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "--");
const ago = (iso?: string | null) => {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return `${Math.round(s)}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const usd = (v?: number | null) => (v == null ? "--" : v < 0.01 && v > 0 ? `$${v.toPrecision(3)}` : v < 1000 ? `$${v.toFixed(2)}` : fmtCompact(v));
const pct = (v?: number | null) => (v == null ? "--" : `${v.toFixed(1)}%`);

export function ReportView({
  report, rank, freshness, history, changes, onRefresh, refreshing, onShare,
}: {
  report: Report;
  rank?: Rank | null;
  freshness: Freshness;
  history?: HistoryPoint[] | null;
  changes?: { since: string; list: Change[] } | null;
  onRefresh: () => void;
  refreshing: boolean;
  onShare: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const t = tierInfo(report.score?.tier);
  const m = report.market?.status === "ok" ? report.market.value : null;
  const findings = [...(report.findings ?? [])].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
  const flags = findings.filter(isFlag);
  const missing = findings.filter(isMissing);
  const passed = findings.filter((f) => f.severity === "pass");
  const info = findings.filter((f) => f.severity === "info");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="flex flex-col gap-4 min-w-0 [overflow-wrap:anywhere]">
      {/* token header */}
      <div className="panel p-4 md:p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl md:text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]" title={report.token?.name ?? undefined}>{clipText(report.token?.name, 60) || "Unnamed token"}</h2>
              {report.token?.symbol && <span title={report.token.symbol}><Badge>{clipText(report.token.symbol, 16)}</Badge></span>}
              <Badge tone="accent">{chainName(report.chain)}</Badge>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span className="num break-all">{report.address}</span>
              <button onClick={copy} className="text-accent hover:underline shrink-0">{copied ? "Copied" : "Copy"}</button>
            </div>
          </div>
          <FreshnessTag f={freshness} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" onClick={onRefresh} disabled={refreshing} className="!py-1.5 text-xs">{refreshing ? "Scanning…" : "Refresh scan"}</Button>
          <a href={agentsiReportUrl(report.chain, report.address)} target="_blank" rel="noreferrer"
            className="rounded-md border border-line-2 px-3 py-1.5 text-xs text-fg hover:border-accent/50">Open full Agent SI report ↗</a>
          <Button variant="ghost" onClick={onShare} className="!py-1.5 text-xs">Share report</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* score */}
        <div className="panel p-5 flex flex-col gap-4">
          <div className="text-[11px] uppercase tracking-wider text-faint">SI Score</div>
          {report.score ? (
            <>
              <div className="flex items-end gap-3">
                <span className="num text-6xl font-semibold leading-none" style={{ color: t.color }}>{report.score.points}</span>
                <span className="text-faint text-sm mb-1">/ 100</span>
              </div>
              <ScoreBar points={report.score.points} color={t.color} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded px-2 py-0.5 text-xs font-semibold tracking-wider" style={{ color: t.color, background: `${t.color}1a`, border: `1px solid ${t.color}55` }}>
                  {report.score.label ?? t.label}
                </span>
                {report.score.confidence && <Badge>Confidence: {report.score.confidence}</Badge>}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <Kv k="Checks answered" v={report.score.checks ? `${report.score.checks.checked} of ${report.score.checks.total}` : "--"} />
                <Kv k="Flags raised" v={String(flags.length)} />
                <Kv k="Checks passed" v={String(passed.length)} />
                <Kv k="Core checks without data" v={report.score.checks ? String(report.score.checks.total - report.score.checks.checked) : "--"} />
                {rank && <Kv k="Rank" v={`#${rank.position} of ${rank.of} on ${chainName(rank.chain)}`} />}
              </dl>
              {!!report.score.deductions?.length && (
                <div className="text-xs">
                  <div className="text-faint mb-1">Deductions</div>
                  <ul className="flex flex-col gap-1">
                    {report.score.deductions.map((d, i) => (
                      <li key={i} className="flex justify-between gap-2"><span className="text-muted">{d.label}</span><span className="num text-short">−{d.points}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {report.score.cappedBy && <p className="text-xs text-warn">Capped by: {report.score.cappedBy}</p>}
            </>
          ) : (
            <p className="text-sm text-muted">Agent SI returned no score for this scan.</p>
          )}
          <p className="text-[11px] text-faint leading-relaxed">
            The SI Score measures the evidence Agent SI could read at scan time. It does not guarantee a token is safe and is not financial advice.
          </p>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          {/* verdict */}
          {report.verdict?.headline && (
            <div className="panel p-5" style={{ borderColor: `${t.color}44` }}>
              <div className="text-[11px] uppercase tracking-wider text-faint mb-1">Key findings</div>
              <p className="text-fg font-medium">{report.verdict.headline}</p>
              {report.verdict.text && <p className="text-sm text-muted mt-2 leading-relaxed">{report.verdict.text}</p>}
            </div>
          )}

          {/* market */}
          <Section title="Market" src={srcLine(report, report.market)}>
            {m ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Metric k="Price" v={usd(m.priceUsd)} />
                <Metric k="Liquidity" v={usd(m.liquidityUsd)} />
                <Metric k="Market cap" v={m.marketCap != null ? usd(m.marketCap) : "Not reported"} />
                <Metric k="FDV" v={usd(m.fdv)} />
                <Metric k="24h volume" v={usd(m.volume?.h24)} />
                <Metric k="24h change" v={m.priceChange?.h24 != null ? fmtPct(m.priceChange.h24 / 100) : "--"} tone={m.priceChange?.h24} />
                <Metric k="Pools" v={m.pairCount != null ? String(m.pairCount) : "--"} />
                <Metric k="Main pool" v={m.primaryPair?.dexId ? `${m.primaryPair.dexId}${m.primaryPair.quoteSymbol ? ` / ${m.primaryPair.quoteSymbol}` : ""}` : "--"} />
              </div>
            ) : (
              <NoData f={report.market} what="market" />
            )}
          </Section>
        </div>
      </div>

      {changes && changes.list.length === 0 && (
        <Section title="Changes since your last view" src={`Compared with the scan from ${dt(changes.since)}`}>
          <p className="text-sm text-muted">
            No change in score, liquidity, ownership, controls, holder concentration or findings.
          </p>
        </Section>
      )}
      {changes && changes.list.length > 0 && (
        <Section title="Changes since your last view" src={`Compared with the scan from ${dt(changes.since)}`}>
          <ul className="divide-y divide-line text-sm">
            {changes.list.map((c, i) => (
              <li key={i} className="py-2 grid grid-cols-[120px_1fr] sm:grid-cols-[160px_1fr_1fr] gap-2">
                <span className="text-muted">{c.label}</span>
                <span className="num text-faint hidden sm:block">{c.before}</span>
                <span className={clsx("num", c.tone === "good" ? "text-long" : c.tone === "bad" ? "text-short" : "text-fg")}>{c.after}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* security & control */}
      <Section title="Contract controls & permissions" src="Each row shows where the value was read and when.">
        <ControlsTable report={report} />
      </Section>

      {/* findings */}
      <Section title={`Findings (${findings.length})`} src="Every finding as Agent SI reported it, with its evidence and source.">
        {findings.length ? (
          <div className="flex flex-col gap-4">
            {flags.length > 0 && <FindingGroup title="Flagged" items={flags} report={report} />}
            {missing.length > 0 && <FindingGroup title="Could not be checked" items={missing} report={report} />}
            {info.length > 0 && <FindingGroup title="Information" items={info} report={report} />}
            {passed.length > 0 && <FindingGroup title="Passed" items={passed} report={report} />}
          </div>
        ) : (
          <p className="text-sm text-muted">Agent SI returned no findings.</p>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Holder concentration" src={srcLine(report, report.holders)}>
          <Holders report={report} />
        </Section>
        <Section title="Liquidity" src={srcLine(report, report.market)}>
          <Liquidity report={report} />
        </Section>
      </div>

      {(history?.length || report.memory?.previous) && (
        <Section title="Agent SI scan history" src="Earlier scans of this token recorded by Agent SI (SI memory).">
          {report.memory?.previous && (
            <p className="text-sm text-muted mb-3">
              Previous scan {dt(report.memory.previous.at)}
              {report.memory.liquidityChangePct != null && <> · liquidity <span className={report.memory.liquidityChangePct >= 0 ? "text-long" : "text-short"}>{report.memory.liquidityChangePct > 0 ? "+" : ""}{report.memory.liquidityChangePct.toFixed(1)}%</span> since then</>}
              {report.memory.scanCount != null && <> · {report.memory.scanCount} scans in total</>}
            </p>
          )}
          {!!history?.length && (
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-xs">
                <thead><tr className="text-faint text-left"><th className="py-1.5 pr-3 font-normal">Scanned</th><th className="py-1.5 pr-3 font-normal text-right">Liquidity</th><th className="py-1.5 pr-3 font-normal text-right">Market cap</th><th className="py-1.5 font-normal">Posture</th></tr></thead>
                <tbody>
                  {history.slice(0, 12).map((h, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-1.5 pr-3 text-muted">{dt(h.at)}</td>
                      <td className="py-1.5 pr-3 num text-right">{usd(h.liquidityUsd)}</td>
                      <td className="py-1.5 pr-3 num text-right">{h.marketCap != null ? usd(h.marketCap) : "--"}</td>
                      <td className="py-1.5 capitalize">{h.posture ?? "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <OnchainSection report={report} />

      {/* sources */}
      {!!report.sources?.length && (
        <Section title="Sources" src={`Scan written ${dt(report.createdAt)}`}>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
            {report.sources.map((s) => (
              <li key={s.id} className="flex justify-between gap-3 border-b border-line py-1">
                <span className="text-muted">{s.label}</span>
                <span className="text-faint num">{dt(s.fetchedAt)}</span>
              </li>
            ))}
          </ul>
          {!!report.errors?.length && <p className="text-xs text-warn mt-2">Agent SI reported {report.errors.length} source error(s) during this scan; affected checks are shown as no data.</p>}
        </Section>
      )}

      <p className="text-[11px] text-faint">
        Intelligence by <a href="https://agentsi.site" target="_blank" rel="noreferrer" className="text-muted hover:text-fg">Agent SI</a>, built by{" "}
        <a href="https://bypanther.pro" target="_blank" rel="noreferrer" className="text-muted hover:text-fg">PANTHER</a>. Research, not advice.
      </p>
    </div>
  );
}

function FreshnessTag({ f }: { f: Freshness }) {
  const text = f.kind === "fresh" ? "Fresh scan" : f.kind === "cached" ? "Agent SI cached result" : "Saved report";
  return (
    <div className={clsx("rounded-md border px-3 py-2 text-xs", f.kind === "fresh" ? "border-accent/40 bg-accent/10 text-accent" : "border-warn/40 bg-warn/10 text-warn")}>
      <div className="font-medium">{text}</div>
      <div className="opacity-80">Data read {dt(f.at)} ({ago(f.at)})</div>
    </div>
  );
}

function ScoreBar({ points, color }: { points: number; color: string }) {
  return (
    <div className="relative h-2 rounded-full bg-raised overflow-hidden">
      <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(100, points))}%`, background: color, boxShadow: `0 0 12px ${color}88` }} />
      {[25, 45, 65, 85].map((x) => <span key={x} className="absolute inset-y-0 w-px bg-bg/80" style={{ left: `${x}%` }} />)}
    </div>
  );
}

function srcLine(report: Report, f?: Sourced<unknown>) {
  if (!f?.source) return undefined;
  const s = sourceOf(report, f.source);
  return `${s ? evidenceKind(s.label) : f.source} · read ${dt(f.fetchedAt ?? s?.fetchedAt)}`;
}

function Section({ title, src, children }: { title: string; src?: string; children: ReactNode }) {
  return (
    <section className="panel p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {src && <span className="text-[11px] text-faint">{src}</span>}
      </div>
      {children}
    </section>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-line bg-panel-2 px-2 py-1.5">
      <dt className="text-faint text-[10px] uppercase tracking-wider">{k}</dt>
      <dd className="num text-fg mt-0.5">{v}</dd>
    </div>
  );
}

function Metric({ k, v, tone }: { k: string; v: string; tone?: number | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-faint">{k}</div>
      <div className={clsx("num text-sm mt-0.5", tone == null ? "text-fg" : tone >= 0 ? "text-long" : "text-short")}>{v}</div>
    </div>
  );
}

function NoData({ f, what }: { f?: Sourced<unknown>; what: string }) {
  if (!f) return <p className="text-sm text-muted">Agent SI returned no {what} data.</p>;
  if (f.status === "not-applicable") return <p className="text-sm text-muted">Not applicable for this token{f.note ? `: ${f.note}` : "."}</p>;
  return <p className="text-sm text-warn">No {what} data ({f.status}){f.note ? `: ${f.note}` : ""}. Not counted as a pass.</p>;
}

function FindingGroup({ title, items, report }: { title: string; items: Finding[]; report: Report }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-faint mb-2">{title}</div>
      <ul className="flex flex-col gap-2">
        {items.map((f) => {
          const s = sourceOf(report, f.source);
          return (
            <li key={f.id} className="rounded border border-line bg-panel-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={severityTone(f.severity)}>{f.severity.toUpperCase()}</Badge>
                <span className="text-sm text-fg font-medium">{f.title}</span>
              </div>
              {f.evidence && <p className="text-sm text-muted mt-1.5 leading-relaxed">{f.evidence}</p>}
              {s && (
                <div className="mt-1.5 text-[11px] text-faint">
                  Evidence: <span className="text-muted">{evidenceKind(s.label)}</span>
                  {evidenceKind(s.label) !== s.label && <> ({s.label})</>}
                  {s.fetchedAt && <> · read {dt(s.fetchedAt)}</>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type Row = { label: string; value: ReactNode; state: "good" | "bad" | "neutral" | "unknown"; src?: Sourced<unknown> };

function ControlsTable({ report }: { report: Report }) {
  const sec = report.security;
  const s = sec?.status === "ok" ? sec.value ?? {} : null;
  const ctl = report.control;
  const c = ctl?.status === "ok" ? ctl.value : null;
  const evmLike = ctl?.status !== "not-applicable";
  const boolRow = (label: string, v: boolean | null | undefined, badWhenTrue = true, src: Sourced<unknown> | undefined = sec): Row => {
    const y = yesNo(s ? v : undefined);
    return {
      label,
      value: y === "unknown" ? "No data" : y === "yes" ? "Yes" : "No",
      state: y === "unknown" ? "unknown" : (y === "yes") === badWhenTrue ? "bad" : "good",
      src,
    };
  };
  const rows: Row[] = [];

  if (evmLike) {
    rows.push({
      label: "Contract owner",
      value: !c ? "No data" : c.owner ? <span className="num">{shortAddr(c.owner)}{c.ownerIsContract ? " (contract)" : ""}</span> : c.ownerKnown ? "None reported" : "Not exposed (no owner() found)",
      state: !c ? "unknown" : "neutral",
      src: ctl,
    });
    rows.push(boolRow("Hidden owner", s?.hiddenOwner));
    rows.push(boolRow("Upgradeable (proxy)", s?.proxy ?? (c ? (c.proxy ? true : c.proxy === null ? null : false) : null)));
  }
  rows.push(boolRow("Can mint new supply", s?.mintable));
  rows.push(boolRow("Can pause transfers", s?.pausable));
  rows.push(boolRow("Blacklist function", s?.blacklist));
  rows.push(boolRow("Trading limits / restrictions", s?.tradingLimits));
  rows.push(boolRow("Honeypot (can't sell)", s?.honeypot));
  rows.push({
    label: "Buy / sell tax",
    value: s && (s.buyTaxPct != null || s.sellTaxPct != null) ? `${s.buyTaxPct ?? "?"}% / ${s.sellTaxPct ?? "?"}%` : "No data",
    state: !s || (s.buyTaxPct == null && s.sellTaxPct == null) ? "unknown" : (s.buyTaxPct ?? 0) === 0 && (s.sellTaxPct ?? 0) === 0 ? "good" : "neutral",
    src: sec,
  });
  rows.push(boolRow("Tax can be changed", s?.modifiableTax));
  rows.push(boolRow("Source code verified", s?.openSource, false));
  if (report.mintAuthority && report.mintAuthority.status !== "not-applicable") {
    rows.push(authorityRow("Mint authority", report.mintAuthority));
    rows.push(authorityRow("Freeze authority", report.freezeAuthority));
  }
  if (s && s.metadataMutable != null) rows.push(boolRow("Metadata can change", s.metadataMutable));
  if (c && Array.isArray(c.functions)) {
    rows.push({
      label: "Privileged functions found",
      value: c.functions.length ? c.functions.map((f) => (typeof f === "string" ? f : JSON.stringify(f))).join(", ") : "None found",
      state: c.functions.length ? "bad" : "good",
      src: ctl,
    });
  }

  return (
    <div className="divide-y divide-line">
      {rows.map((r) => {
        const src = r.src?.source ? sourceOf(report, r.src.source) : null;
        return (
          <div key={r.label} className="py-2 grid grid-cols-[1fr_auto] sm:grid-cols-[220px_1fr_auto] gap-x-3 gap-y-0.5 items-center text-sm">
            <span className="text-muted">{r.label}</span>
            <span className={clsx("sm:order-none order-last col-span-2 sm:col-span-1 text-[11px] text-faint sm:text-xs")}>
              {src ? `${evidenceKind(src.label)} · ${dt(r.src?.fetchedAt ?? src.fetchedAt)}` : r.src && r.src.status !== "ok" ? `Status: ${r.src.status}` : ""}
            </span>
            <span className={clsx("text-right", r.state === "good" ? "text-long" : r.state === "bad" ? "text-short" : r.state === "unknown" ? "text-warn" : "text-fg")}>{r.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function authorityRow(label: string, f?: Sourced<string>): Row {
  if (!f || f.status !== "ok") return { label, value: "No data", state: "unknown", src: f };
  return { label, value: f.value ? <span className="num">{shortAddr(f.value)}</span> : "None (revoked)", state: f.value ? "bad" : "good", src: f };
}

function Holders({ report }: { report: Report }) {
  const h = report.holders;
  if (!h || h.status !== "ok" || !h.value) return <NoData f={h} what="holder" />;
  const v = h.value;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Metric k="Holders" v={v.holdersCount != null ? v.holdersCount.toLocaleString() : "--"} />
        <Metric k="Top 10 wallets" v={pct(v.top10WalletPct)} />
        <Metric k="Largest wallet" v={pct(v.topWalletPct)} />
        <Metric k="In pools" v={pct(v.poolPct)} />
        <Metric k="Burned" v={pct(v.burnedPct)} />
        <Metric k="Other contracts" v={pct(v.contractPct)} />
      </div>
      {!!v.top?.length && (
        <table className="w-full text-xs">
          <thead><tr className="text-faint text-left"><th className="py-1 font-normal">Holder</th><th className="py-1 font-normal">Type</th><th className="py-1 font-normal text-right">Share</th></tr></thead>
          <tbody>
            {v.top.slice(0, 10).map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1 num text-muted">{shortAddr(r.owner ?? r.tokenAccount ?? "")}</td>
                <td className="py-1 capitalize text-muted">{r.tag ?? r.label ?? "--"}</td>
                <td className="py-1 num text-right">{pct(r.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {v.basis && <p className="text-[11px] text-faint">Basis: {v.basis}. Pools, burns and contracts are counted separately from wallets.</p>}
    </div>
  );
}

function Liquidity({ report }: { report: Report }) {
  const m = report.market?.status === "ok" ? report.market.value : null;
  const s = report.security?.status === "ok" ? report.security.value : null;
  if (!m) return <NoData f={report.market} what="liquidity" />;
  const flags = (report.findings ?? []).filter((f) => f.category === "liquidity");
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Metric k="Total liquidity" v={usd(m.liquidityUsd)} />
        <Metric k="LP locked or burned" v={s?.lpLockedPct != null ? `${s.lpLockedPct.toFixed(1)}%` : "No data"} />
        <Metric k="Largest pool share" v={m.largestPoolShare != null ? `${(m.largestPoolShare * 100).toFixed(1)}%` : "--"} />
        <Metric k="First pool" v={m.firstPoolAt ? dt(m.firstPoolAt) : "--"} />
      </div>
      {flags.map((f) => (
        <p key={f.id} className={clsx("text-xs", isFlag(f) ? "text-warn" : "text-muted")}>{f.title}: {f.evidence}</p>
      ))}
    </div>
  );
}

/** The scan as recorded on the Elyperp Intelligence registry on Robinhood Chain. Hidden until the contract is configured. */
function OnchainSection({ report }: { report: Report }) {
  const [data, setData] = useState<OnchainRecord | null>(null);
  const [tries, setTries] = useState(0);
  const scannedAt = Math.floor(Date.parse(report.createdAt) / 1000);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ address: report.address, chain: report.chain });
    fetch(`/api/intel/onchain?${qs}`)
      .then((r) => (r.ok ? (r.json() as Promise<OnchainRecord>) : null))
      .then((d) => !cancelled && d && setData(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [report.address, report.chain, report.createdAt, tries]);

  // A new scan is written to the chain just after it finishes; look again a few times.
  const behind = !!data?.configured && (!data.record || data.record.scannedAt < scannedAt);
  useEffect(() => {
    if (!behind || tries >= 3) return;
    const t = setTimeout(() => setTries((n) => n + 1), 20_000);
    return () => clearTimeout(t);
  }, [behind, tries]);

  if (!data?.configured || !data.registry) return null;
  const rec = data.record;
  const link = `https://robinhoodchain.blockscout.com/address/${data.registry}`;
  const matches = !!rec && rec.reportHash.toLowerCase() === reportHash(report).toLowerCase();

  return (
    <Section title="Robinhood Chain record" src="Elyperp Intelligence registry">
      <div className="text-sm flex flex-col gap-2">
        {!rec ? (
          <p className="text-muted">{tries < 3 ? "Recording this scan on Robinhood Chain…" : "This token isn't recorded on Robinhood Chain yet."}</p>
        ) : matches ? (
          <p className="text-long">✓ This exact report is recorded on Robinhood Chain.</p>
        ) : rec.scannedAt < scannedAt ? (
          <p className="text-muted">{tries < 3 ? "Recording this scan on Robinhood Chain… The record below is from an earlier scan." : "The on-chain record is from an earlier scan of this token."}</p>
        ) : rec.scannedAt > scannedAt ? (
          <p className="text-muted">A newer scan of this token is recorded on Robinhood Chain. Refresh the scan to see it.</p>
        ) : (
          <p className="text-warn">The on-chain record for this scan time doesn&apos;t match this report.</p>
        )}
        {rec && (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Kv k="Recorded tier" v={rec.tierName} />
            <Kv k="Scan time" v={dt(new Date(rec.scannedAt * 1000).toISOString())} />
            <Kv k="Written on-chain" v={dt(new Date(rec.publishedAt * 1000).toISOString())} />
            <Kv k="Scans recorded" v={String(rec.count)} />
          </dl>
        )}
        {rec && <p className="text-[11px] text-faint num break-all">Report hash {rec.reportHash}</p>}
        <a href={link} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline w-fit">View the registry contract on Blockscout ↗</a>
      </div>
    </Section>
  );
}

