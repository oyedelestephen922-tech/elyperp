import { SubscriptionClient, WebSocketTransport, type InfoClient } from "@nktkas/hyperliquid";
import { classify, type MarketCategory } from "./classify";

export type MarketStatus = "active" | "inactive" | "delisted";

export interface MarketCtx {
  markPx: number;
  midPx: number | null;
  oraclePx: number;
  prevDayPx: number;
  dayNtlVlm: number;
  funding: number; // hourly rate
  openInterest: number; // in base units
  premium: number | null;
}

export interface Market {
  coin: string;
  base: string;
  dex: string;
  dexFullName: string;
  dexDeployer: string | null;
  dexIndex: number;
  assetId: number;
  szDecimals: number;
  maxLeverage: number;
  isolatedOnly: boolean;
  marginMode: "cross" | "strictIsolated" | "noCross";
  isDelisted: boolean;
  status: MarketStatus;
  category: MarketCategory;
  collateral: string;
  ctx: MarketCtx | null;
}

export interface DexInfo {
  name: string;
  fullName: string;
  index: number;
  deployer: string | null;
  collateral: string;
  marketCount: number;
  error?: string;
}

export interface MarketUniverse {
  markets: Market[];
  dexes: DexInfo[];
  fetchedAt: number;
  errors: string[];
}

type RawCtx = {
  markPx: string; midPx: string | null; oraclePx: string; prevDayPx: string; dayNtlVlm: string;
  funding: string; openInterest: string; premium: string | null;
};

export function parseCtx(c: RawCtx): MarketCtx {
  return {
    markPx: Number(c.markPx),
    midPx: c.midPx == null ? null : Number(c.midPx),
    oraclePx: Number(c.oraclePx),
    prevDayPx: Number(c.prevDayPx),
    dayNtlVlm: Number(c.dayNtlVlm),
    funding: Number(c.funding),
    openInterest: Number(c.openInterest),
    premium: c.premium == null ? null : Number(c.premium),
  };
}

export function statusOf(isDelisted: boolean, ctx: MarketCtx | null): MarketStatus {
  if (isDelisted) return "delisted";
  if (!ctx || !(ctx.markPx > 0) || !(ctx.oraclePx > 0)) return "inactive";
  return "active";
}

// builder dexes: 100000 + dexIndex * 10000 + index in that dex's universe
export function hip3AssetId(dexIndex: number, indexInMeta: number) {
  return dexIndex === 0 ? indexInMeta : 100000 + dexIndex * 10000 + indexInMeta;
}

// one WS message has ctxs for every dex; way cheaper than an http call per dex (testnet has ~280)
export async function snapshotAllCtxs(isTestnet: boolean, timeoutMs = 8000): Promise<Map<string, RawCtx[]>> {
  const ws = new WebSocketTransport({ isTestnet });
  const subs = new SubscriptionClient({ transport: ws });
  try {
    return await new Promise<Map<string, RawCtx[]>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("allDexsAssetCtxs snapshot timed out")), timeoutMs);
      subs
        .allDexsAssetCtxs((ev) => {
          clearTimeout(timer);
          resolve(new Map(ev.ctxs));
        })
        .catch((e) => {
          clearTimeout(timer);
          reject(e);
        });
    });
  } finally {
    ws.close();
  }
}

export async function discoverMarkets(
  info: InfoClient,
  opts: { isTestnet: boolean; ctxSnapshot?: () => Promise<Map<string, RawCtx[]>> },
): Promise<MarketUniverse> {
  const errors: string[] = [];
  const [dexList, metas, categories, spotMeta] = await Promise.all([
    info.perpDexs(),
    info.allPerpMetas(),
    info.perpCategories().catch((e) => {
      errors.push(`perpCategories unavailable: ${String(e?.message ?? e)}`);
      return [] as [string, string][];
    }),
    info.spotMeta().catch((e) => {
      errors.push(`spotMeta unavailable: ${String(e?.message ?? e)}`);
      return null;
    }),
  ]);

  let ctxByDex: Map<string, RawCtx[]>;
  try {
    ctxByDex = await (opts.ctxSnapshot ?? (() => snapshotAllCtxs(opts.isTestnet)))();
  } catch (e) {
    errors.push(`ctx snapshot failed, using canonical dex only: ${String((e as Error)?.message ?? e)}`);
    const [, mainCtxs] = await info.metaAndAssetCtxs();
    ctxByDex = new Map([["", mainCtxs]]);
  }

  const catMap = new Map(categories);
  const tokenName = new Map<number, string>();
  spotMeta?.tokens.forEach((t) => tokenName.set(t.index, t.name));

  const markets: Market[] = [];
  const dexes: DexInfo[] = [];
  const canonicalCrypto = new Set((metas[0]?.universe ?? []).map((u) => u.name));

  dexList.forEach((d, index) => {
    const name = index === 0 || !d ? "" : d.name;
    if (index > 0 && !name) return;
    const fullName = index === 0 || !d ? "Hyperliquid" : d.fullName || d.name;
    const deployer = index === 0 || !d ? null : d.deployer;
    const meta = metas[index];
    if (!meta) {
      errors.push(`no metadata for dex "${name || "hyperliquid"}"`);
      dexes.push({ name, fullName, index, deployer, collateral: "?", marketCount: 0, error: "missing metadata" });
      return;
    }
    const ctxs = ctxByDex.get(name) ?? [];
    const collateral = tokenName.get(meta.collateralToken) ?? (meta.collateralToken === 0 ? "USDC" : `token#${meta.collateralToken}`);
    meta.universe.forEach((u, idx) => {
      const base = u.name.includes(":") ? u.name.split(":")[1] : u.name;
      const ctx = ctxs[idx] ? parseCtx(ctxs[idx]) : null;
      const isDelisted = !!u.isDelisted;
      const marginMode: Market["marginMode"] = u.marginMode ?? (u.onlyIsolated ? "strictIsolated" : "cross");
      markets.push({
        coin: u.name,
        base,
        dex: name,
        dexFullName: fullName,
        dexDeployer: deployer,
        dexIndex: index,
        assetId: hip3AssetId(index, idx),
        szDecimals: u.szDecimals,
        maxLeverage: u.maxLeverage,
        isolatedOnly: !!u.onlyIsolated || marginMode !== "cross",
        marginMode,
        isDelisted,
        status: statusOf(isDelisted, ctx),
        category: classify(base, index !== 0, catMap.get(u.name) ?? catMap.get(base), canonicalCrypto),
        collateral,
        ctx,
      });
    });
    dexes.push({ name, fullName, index, deployer, collateral, marketCount: meta.universe.length });
  });

  if (!markets.length) throw new Error(`Market discovery returned no markets. ${errors.join("; ")}`);
  return { markets, dexes, fetchedAt: Date.now(), errors };
}

export function coinToPath(coin: string) {
  return "/trade/" + coin.split(":").map(encodeURIComponent).join("/");
}
export function pathToCoin(segments: string[]) {
  return segments.map(decodeURIComponent).join(":");
}
