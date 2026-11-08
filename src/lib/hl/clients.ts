import {
  HttpTransport,
  InfoClient,
  SubscriptionClient,
  WebSocketTransport,
} from "@nktkas/hyperliquid";
import { IS_TESTNET } from "../config";

let http: HttpTransport | null = null;
let info: InfoClient | null = null;

export function getHttpTransport() {
  if (!http) http = new HttpTransport({ isTestnet: IS_TESTNET, timeout: 15_000 });
  return http;
}

export function getInfo() {
  if (!info) info = new InfoClient({ transport: getHttpTransport() });
  return info;
}

// ---------------------------------------------------------------------------
// WebSocket (browser only). One shared socket; the SDK re-subscribes on reconnect.
// ---------------------------------------------------------------------------

type WsStatus = "connecting" | "open" | "closed";
let ws: WebSocketTransport | null = null;
let subs: SubscriptionClient | null = null;
let status: WsStatus = "connecting";
const statusListeners = new Set<(s: WsStatus) => void>();

function setStatus(s: WsStatus) {
  status = s;
  statusListeners.forEach((l) => l(s));
}

export function getSubs(): SubscriptionClient {
  if (typeof window === "undefined") throw new Error("WebSocket subscriptions are browser-only");
  if (!subs) {
    ws = new WebSocketTransport({ isTestnet: IS_TESTNET });
    ws.socket.addEventListener("open", () => setStatus("open"));
    ws.socket.addEventListener("close", () => setStatus("closed"));
    ws.socket.addEventListener("error", () => setStatus("closed"));
    ws.ready().then(() => setStatus("open")).catch(() => setStatus("closed"));
    subs = new SubscriptionClient({ transport: ws });
  }
  return subs;
}

export function getWsStatus() {
  return status;
}

export function onWsStatus(fn: (s: WsStatus) => void) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
