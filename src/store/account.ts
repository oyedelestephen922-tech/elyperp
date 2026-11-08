"use client";
import { create } from "zustand";
import type {
  ClearinghouseStateResponse,
  FrontendOpenOrdersResponse,
  UserFillsResponse,
  UserFeesResponse,
  SpotClearinghouseStateResponse,
} from "@nktkas/hyperliquid/api/info";

export type ChState = ClearinghouseStateResponse;
export type OpenOrderRow = FrontendOpenOrdersResponse[number] & { dex: string };
export type FillRow = UserFillsResponse[number];

interface AccountState {
  user: `0x${string}` | null;
  states: Record<string, ChState>; // per dex ("" = Hyperliquid)
  openOrders: OpenOrderRow[];
  fills: FillRow[];
  fees: UserFeesResponse | null;
  spot: SpotClearinghouseStateResponse | null;
  loaded: boolean;
  noAccount: boolean;
  updatedAt: number;
  error: string | null;
  set: (p: Partial<AccountState>) => void;
  reset: (user: `0x${string}` | null) => void;
}

export const useAccountStore = create<AccountState>((set) => ({
  user: null,
  states: {},
  openOrders: [],
  fills: [],
  fees: null,
  spot: null,
  loaded: false,
  noAccount: false,
  updatedAt: 0,
  error: null,
  set: (p) => set(p),
  reset: (user) =>
    set({ user, states: {}, openOrders: [], fills: [], fees: null, spot: null, loaded: false, noAccount: false, updatedAt: 0, error: null }),
}));

export interface PositionRow {
  coin: string;
  dex: string;
  szi: number;
  side: "long" | "short";
  entryPx: number;
  positionValue: number;
  unrealizedPnl: number;
  roe: number;
  liqPx: number | null;
  marginUsed: number;
  leverage: number;
  leverageType: "cross" | "isolated";
  cumFunding: number;
}

export function selectPositions(states: Record<string, ChState>): PositionRow[] {
  const out: PositionRow[] = [];
  for (const [dex, st] of Object.entries(states)) {
    for (const { position: p } of st.assetPositions) {
      const szi = Number(p.szi);
      if (!szi) continue;
      out.push({
        coin: p.coin,
        dex,
        szi,
        side: szi > 0 ? "long" : "short",
        entryPx: Number(p.entryPx),
        positionValue: Number(p.positionValue),
        unrealizedPnl: Number(p.unrealizedPnl),
        roe: Number(p.returnOnEquity),
        liqPx: p.liquidationPx == null ? null : Number(p.liquidationPx),
        marginUsed: Number(p.marginUsed),
        leverage: p.leverage.value,
        leverageType: p.leverage.type,
        cumFunding: Number(p.cumFunding.sinceOpen),
      });
    }
  }
  return out;
}

export function selectSummary(states: Record<string, ChState>) {
  let equity = 0, used = 0, withdrawable = 0, ntl = 0, maint = 0;
  for (const st of Object.values(states)) {
    equity += Number(st.marginSummary.accountValue);
    used += Number(st.marginSummary.totalMarginUsed);
    withdrawable += Number(st.withdrawable);
    ntl += Number(st.marginSummary.totalNtlPos);
    maint += Number(st.crossMaintenanceMarginUsed);
  }
  const upnl = selectPositions(states).reduce((a, p) => a + p.unrealizedPnl, 0);
  return { equity, used, withdrawable, ntl, maint, upnl, marginRatio: equity > 0 ? maint / equity : 0 };
}
