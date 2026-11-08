"use client";
import clsx from "clsx";
import { useToasts, type Toast } from "@/store/toasts";
import { Spinner } from "./primitives";

const LABEL: Record<Toast["state"], string> = {
  pending: "Pending",
  submitted: "Submitted",
  open: "Open",
  filled: "Filled",
  partial: "Partially filled",
  cancelled: "Cancelled",
  rejected: "Rejected",
  failed: "Failed",
  info: "",
  error: "Error",
  success: "Done",
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed z-[60] bottom-3 right-3 left-3 sm:left-auto sm:w-80 flex flex-col gap-2 pointer-events-none" aria-live="polite">
      {toasts.map((t) => {
        const bad = t.state === "rejected" || t.state === "failed" || t.state === "error";
        const good = t.state === "filled" || t.state === "success";
        return (
          <div
            key={t.id}
            className={clsx(
              "pointer-events-auto rise panel bg-panel-2 px-3 py-2.5 text-xs border-l-2",
              bad ? "border-l-short" : good ? "border-l-long" : t.state === "partial" ? "border-l-warn" : "border-l-accent/60",
            )}
          >
            <div className="flex items-center gap-2">
              {(t.state === "pending" || t.state === "submitted") && <Spinner />}
              <span className="font-medium text-fg flex-1">{t.title}</span>
              {LABEL[t.state] && (
                <span className={clsx("uppercase tracking-wide text-[10px]", bad ? "text-short" : good ? "text-long" : "text-muted")}>
                  {LABEL[t.state]}
                </span>
              )}
              <button onClick={() => dismiss(t.id)} className="text-faint hover:text-fg" aria-label="Dismiss">×</button>
            </div>
            {t.detail && <div className={clsx("mt-1 break-words", bad ? "text-short/90" : "text-muted")}>{t.detail}</div>}
          </div>
        );
      })}
    </div>
  );
}
