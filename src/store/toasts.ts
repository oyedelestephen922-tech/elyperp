"use client";
import { create } from "zustand";
import type { TxState } from "@/lib/hl/trade";

export interface Toast {
  id: string;
  title: string;
  state: TxState | "info" | "error" | "success";
  detail?: string;
  oid?: number;
  at: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, "id" | "at">) => string;
  update: (id: string, t: Partial<Toast>) => void;
  updateByOid: (oid: number, t: Partial<Toast>) => void;
  dismiss: (id: string) => void;
}

const TERMINAL = new Set(["filled", "cancelled", "rejected", "failed", "error", "success", "info", "partial"]);

export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts.slice(-5), { ...t, id, at: Date.now() }] }));
    scheduleDismiss(id, t.state, get);
    return id;
  },
  update: (id, t) => {
    set((s) => ({ toasts: s.toasts.map((x) => (x.id === id ? { ...x, ...t } : x)) }));
    if (t.state) scheduleDismiss(id, t.state, get);
  },
  updateByOid: (oid, t) => {
    const target = get().toasts.find((x) => x.oid === oid);
    if (target) get().update(target.id, t);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

function scheduleDismiss(id: string, state: Toast["state"], get: () => ToastStore) {
  if (!TERMINAL.has(state)) return;
  const ms = state === "rejected" || state === "failed" || state === "error" ? 12000 : 6000;
  setTimeout(() => get().dismiss(id), ms);
}
