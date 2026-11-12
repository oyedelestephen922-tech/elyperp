"use client";
import { create } from "zustand";
import { LIGHTER } from "../config";

/**
 * One shared WebSocket to Lighter for the whole app. Components subscribe to
 * channels ("order_book/1", "trade/1", "market_stats/all"); the socket
 * reconnects with backoff and re-subscribes everything it had.
 *
 * Lighter's protocol: send {type:"subscribe", channel:"order_book/1"}; messages
 * come back as {type:"subscribed/order_book" | "update/order_book", channel:"order_book:1", ...}.
 * The server pings with {type:"ping"} and expects {type:"pong"}.
 */

export type WsMessage = { type: string; channel?: string; [k: string]: unknown };
type Handler = (m: WsMessage) => void;

export const useWsState = create<{ status: "open" | "connecting" | "closed"; lastMessageAt: number }>(() => ({
  status: "closed",
  lastMessageAt: 0,
}));

/** "order_book/1" → "order_book:1", matching the channel name Lighter puts on messages. */
export const channelKey = (sub: string) => sub.replace("/", ":");

class LighterSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>(); // keyed by subscribe channel ("order_book/1")
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  subscribe(channel: string, handler: Handler): () => void {
    let set = this.handlers.get(channel);
    const fresh = !set;
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);
    // Lighter refuses a second subscribe on the same channel, and only the first
    // subscribe gets a snapshot. A new listener re-subscribes so everyone gets a fresh one.
    if (fresh) this.send({ type: "subscribe", channel });
    else this.resubscribe(channel);
    this.ensure();
    return () => {
      const s = this.handlers.get(channel);
      if (!s) return;
      s.delete(handler);
      if (!s.size) {
        this.handlers.delete(channel);
        this.send({ type: "unsubscribe", channel });
      }
    };
  }

  /** Ask for a fresh snapshot (unsubscribe, then subscribe). */
  resubscribe(channel: string) {
    if (!this.handlers.has(channel)) return;
    this.send({ type: "unsubscribe", channel });
    this.send({ type: "subscribe", channel });
  }

  private send(m: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private ensure() {
    if (typeof window === "undefined") return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.timer) return;
    this.connect();
  }

  private connect() {
    this.timer = null;
    useWsState.setState({ status: "connecting" });
    let ws: WebSocket;
    try {
      ws = new WebSocket(LIGHTER.wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onmessage = (ev) => {
      let m: WsMessage;
      try {
        m = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      useWsState.setState({ lastMessageAt: Date.now() });
      if (m.type === "ping") {
        this.send({ type: "pong" });
        return;
      }
      if (m.type === "connected") {
        this.retry = 0;
        useWsState.setState({ status: "open" });
        for (const ch of this.handlers.keys()) this.send({ type: "subscribe", channel: ch });
        return;
      }
      if (!m.channel) return;
      for (const [ch, set] of this.handlers) {
        if (channelKey(ch) !== m.channel) continue;
        for (const h of set) {
          try {
            h(m);
          } catch (e) {
            console.error("[elyperp] ws handler", e);
          }
        }
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      useWsState.setState({ status: "closed" });
      if (this.handlers.size) this.scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    };
    if (!this.watchdog) {
      // If nothing arrives for 45s the socket is probably dead without a close event.
      this.watchdog = setInterval(() => {
        const { lastMessageAt, status } = useWsState.getState();
        if (status === "open" && Date.now() - lastMessageAt > 45_000) this.ws?.close();
      }, 15_000);
    }
  }

  private scheduleReconnect() {
    if (this.timer) return;
    const delay = Math.min(15_000, 500 * 2 ** this.retry++);
    this.timer = setTimeout(() => this.connect(), delay);
  }
}

let socket: LighterSocket | null = null;
export function lighterWs(): LighterSocket {
  if (!socket) socket = new LighterSocket();
  return socket;
}
