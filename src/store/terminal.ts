"use client";
import { create } from "zustand";

export const useTerminal = create<{ pickedPx: { px: number; at: number } | null; pickPx: (px: number) => void }>((set) => ({
  pickedPx: null,
  pickPx: (px) => set({ pickedPx: { px, at: Date.now() } }),
}));
