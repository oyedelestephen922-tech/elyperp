"use client";
import { logError } from "./errors";

type Sub = { unsubscribe: () => Promise<void> };

export function subscriptionScope() {
  const active: Sub[] = [];
  let closed = false;
  return {
    add(p: Promise<Sub>, name: string) {
      p.then((s) => {
        if (closed) s.unsubscribe().catch(() => {});
        else active.push(s);
      }).catch((e) => logError(`subscribe ${name}`, e));
    },
    close() {
      closed = true;
      active.forEach((s) => s.unsubscribe().catch(() => {}));
    },
  };
}
