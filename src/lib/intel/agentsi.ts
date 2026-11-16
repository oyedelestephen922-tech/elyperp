/**
 * Types and helpers for Agent SI reports, shaped after real responses from
 * https://agentsi.site/api (checked Nov 16, 2026). Every field is optional in practice:
 * the UI shows "No data" rather than assuming a value.
 */

export type Status = "ok" | "not-applicable" | "unknown" | "error" | "unavailable" | string;

/** Most report fields come wrapped with where and when they were read. */
export interface Sourced<T> {
  value: T | null;
  status: Status;
  source?: string;
  fetchedAt?: string;
  note?: string;
}

export interface Finding {
  id: string;
  category?: string;
  severity: "critical" | "high" | "medium" | "low" | "unknown" | "info" | "pass" | string;
  title: string;
  evidence?: string;
  source?: string;
}

export interface Score {
  points: number;
  tier: string;
  label?: string;
  tone?: string;
  confidence?: string;
  checks?: { checked: number; total: number };
  deductions?: { label: string; points: number; severity: string }[];
  cappedBy?: string | null;
}

export interface MarketValue {
  priceUsd?: number | null;
  marketCap?: number | null;
  fdv?: number | null;
  liquidityUsd?: number | null;
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: { h24?: { buys: number; sells: number } };
  pairCount?: number;
  primaryPair?: { dexId?: string; pairAddress?: string; quoteSymbol?: string; liquidityUsd?: number; createdAt?: string } | null;
  firstPoolAt?: string | null;
  largestPoolShare?: number | null;
}

export interface SecurityValue {
  honeypot?: boolean | null;
  buyTaxPct?: number | null;
  sellTaxPct?: number | null;
  mintable?: boolean | null;
  blacklist?: boolean | null;
  pausable?: boolean | null;
  hiddenOwner?: boolean | null;
  proxy?: boolean | null;
  modifiableTax?: boolean | null;
  tradingLimits?: boolean | null;
  lpLockedPct?: number | null;
  holderCount?: number | null;
  openSource?: boolean | null;
  metadataMutable?: boolean | null;
  registryRisks?: unknown[];
  conflicts?: unknown[];
}

export interface ControlValue {
  isContract?: boolean;
  codeSize?: number;
  owner?: string | null;
  ownerKnown?: boolean;
  ownerIsContract?: boolean | null;
  proxy?: unknown;
  functions?: unknown[];
}

export interface HolderRow { tokenAccount?: string; owner?: string; amount?: number; pct?: number; label?: string; tag?: string | null }
export interface HoldersValue {
  top?: HolderRow[];
  top10Pct?: number;
  top10WalletPct?: number;
  topWalletPct?: number;
  burnedPct?: number;
  poolPct?: number;
  exchangePct?: number;
  contractPct?: number;
  programPct?: number;
  holdersCount?: number;
  basis?: string;
}

export interface Report {
  id?: string;
  address: string;
  chain: string;
  createdAt: string;
  mode?: string;
  token?: { name?: string; symbol?: string; program?: string; decimals?: number };
  market?: Sourced<MarketValue>;
  supply?: Sourced<number>;
  mintAuthority?: Sourced<string>;
  freezeAuthority?: Sourced<string>;
  extensions?: Sourced<unknown[]>;
  control?: Sourced<ControlValue>;
  security?: Sourced<SecurityValue>;
  listings?: Sourced<unknown>;
  holders?: Sourced<HoldersValue>;
  age?: Sourced<{ firstPoolAt?: string | null; firstTxAt?: string | null; deployedAt?: string | null }>;
  memory?: { previous?: { at: string; liquidityUsd?: number | null; posture?: string; marketCap?: number | null } | null; liquidityChangePct?: number | null; scanCount?: number };
  findings?: Finding[];
  posture?: string;
  coverage?: { checked: number; total: number };
  score?: Score;
  verdict?: { headline?: string; text?: string; engine?: string };
  sources?: { id: string; label: string; fetchedAt?: string }[];
  errors?: unknown[];
}

export interface Rank { position: number; of: number; chain: string }
export interface HistoryPoint { at: string; liquidityUsd?: number | null; marketCap?: number | null; posture?: string }
export interface ReportResponse { report: Report; history?: HistoryPoint[]; scanCount?: number; rank?: Rank | null }
export interface DetectResponse {
  address: string;
  chain: string | null;
  reason: string;
  options: string[];
  candidates?: { chain: string; code?: number; pairs?: number; liquidityUsd?: number }[];
}
export type StepLine = { type: "step"; id: string; status: "running" | "done" | "error" | string; detail?: string; ms?: number };
export type ReportLine = { type: "report"; cached: boolean; report: Report; rank?: Rank | null };

export interface LiveEvent {
  id: string;
  at: string;
  type: string;
  subject?: { address: string; chain: string; symbol?: string; name?: string };
  summary: string;
  source?: string;
  link?: string;
  origin?: string;
}

export interface RankRow { address: string; chain: string; symbol?: string; name?: string; points: number; tier: string; label?: string; liquidityUsd?: number; scannedAt?: string }

// ---- tiers (Agent SI's published bands) ----
export const TIERS = [
  { tier: "fortified", label: "FORTIFIED", min: 85, color: "#18d98b" },
  { tier: "solid", label: "SOLID", min: 65, color: "#7ddc4f" },
  { tier: "watchlist", label: "WATCHLIST", min: 45, color: "#f2b84b" },
  { tier: "fragile", label: "FRAGILE", min: 25, color: "#f28a4b" },
  { tier: "hazard", label: "HAZARD", min: 0, color: "#f2495e" },
] as const;

/** Display info for the tier Agent SI returned. We never re-derive it from the points. */
export function tierInfo(tier: string | undefined) {
  return TIERS.find((t) => t.tier === (tier ?? "").toLowerCase()) ?? { tier: tier ?? "unknown", label: (tier ?? "UNKNOWN").toUpperCase(), min: 0, color: "#7c8a84" };
}

// ---- sources ----
/** Label and read time for a source id, using the report's own source list. */
export function sourceOf(report: Report, id?: string) {
  if (!id) return null;
  const s = report.sources?.find((x) => x.id === id);
  return { id, label: s?.label ?? id, fetchedAt: s?.fetchedAt };
}

/** Which of the evidence kinds Agent SI documents a source belongs to. */
export function evidenceKind(label: string) {
  const l = label.toLowerCase();
  if (l.includes("market")) return "Market data";
  if (l.includes("on-chain") || l.includes("chain")) return "On-chain read";
  if (l.includes("holder")) return "Holder index";
  if (l.includes("memory")) return "SI memory";
  if (l.includes("record") || l.includes("registry") || l.includes("listing")) return "Contract record";
  return label;
}

// ---- severity ----
export const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4, info: 5, pass: 6 };
export function severityTone(s: string): "short" | "warn" | "default" | "accent" {
  if (s === "critical" || s === "high") return "short";
  if (s === "medium" || s === "low") return "warn";
  if (s === "pass") return "accent";
  return "default";
}
export const isFlag = (f: Finding) => ["critical", "high", "medium", "low"].includes(f.severity);
export const isMissing = (f: Finding) => f.severity === "unknown";

// ---- address handling ----
export function looksLikeAddress(raw: string): boolean {
  const a = raw.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(a)) return true; // EVM
  if (/^0x[0-9a-fA-F]{1,64}(::[A-Za-z0-9_]+::[A-Za-z0-9_]+)?$/.test(a)) return true; // Sui / Aptos ids and types
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return true; // Solana and other base58 ids (incl. Tron T…)
  if (/^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(a)) return true; // TON
  return false;
}
export const isEvm = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a.trim());

export const CHAIN_NAMES: Record<string, string> = {
  robinhood: "Robinhood Chain", solana: "Solana", ethereum: "Ethereum", base: "Base", bnb: "BNB Chain",
  arbitrum: "Arbitrum", optimism: "Optimism", polygon: "Polygon", avalanche: "Avalanche", ton: "TON", tron: "Tron",
  sui: "Sui", aptos: "Aptos", blast: "Blast", sonic: "Sonic", celo: "Celo", cronos: "Cronos", hyperevm: "HyperEVM",
};
export const chainName = (c: string) => CHAIN_NAMES[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

/** Agent SI's documented report page: https://agentsi.site/scan/<chain>/<address>. */
export const agentsiReportUrl = (chain: string, address: string) => `https://agentsi.site/scan/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`;

// ---- NDJSON ----
export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        yield JSON.parse(line);
      } catch {
        /* skip a malformed line */
      }
    }
    if (done) break;
  }
  const rest = (buf + dec.decode()).trim();
  if (rest) {
    try {
      yield JSON.parse(rest);
    } catch {
      /* ignore */
    }
  }
}

// ---- tri-state values ----
/** Yes / No / No data for a boolean that may be missing. */
export function yesNo(v: boolean | null | undefined): "yes" | "no" | "unknown" {
  return v === true ? "yes" : v === false ? "no" : "unknown";
}

/**
 * Token names and symbols come straight from the chain and can be anything,
 * including spam tokens whose "symbol" is hundreds of tickers glued together.
 * Shorten them for display; show the full text in a tooltip.
 */
export function clipText(s: string | null | undefined, max: number): string {
  if (!s) return "";
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
