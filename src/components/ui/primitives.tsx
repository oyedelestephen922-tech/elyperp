"use client";
import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("flex items-center gap-2 select-none", className)}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <rect x="1" y="1" width="22" height="22" rx="5" fill="#0f1412" stroke="#18d98b" strokeOpacity=".5" />
        <path d="M7 7h10M7 12h7M7 17h10" stroke="#18d98b" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M16.5 10.2 19 12l-2.5 1.8" stroke="#18d98b" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-semibold tracking-tight text-[15px]">
        Ely<span className="text-accent">perp</span>
      </span>
    </span>
  );
}

export function Button({
  children, onClick, variant = "default", disabled, className, type = "button", title,
}: {
  children: ReactNode; onClick?: () => void; variant?: "default" | "accent" | "long" | "short" | "ghost" | "danger";
  disabled?: boolean; className?: string; type?: "button" | "submit"; title?: string;
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        variant === "default" && "bg-raised hover:bg-line-2 text-fg border border-line-2",
        variant === "accent" && "bg-accent text-black hover:bg-[#2ef09d]",
        variant === "long" && "bg-long text-black hover:brightness-110",
        variant === "short" && "bg-short text-white hover:brightness-110",
        variant === "ghost" && "text-muted hover:text-fg hover:bg-raised",
        variant === "danger" && "border border-short/40 text-short hover:bg-short/10",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Modal({ open, onClose, title, children, width = "max-w-md" }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  // Portal to <body>: the header uses backdrop-filter, which would otherwise trap fixed children.
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={clsx("panel rise w-full max-h-[92dvh] overflow-y-auto scroll-thin bg-panel-2 rounded-b-none sm:rounded-lg", width)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-fg text-lg leading-none" aria-label="Close">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: {
  value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; className?: string;
}) {
  return (
    <div className={clsx("flex items-center gap-1 overflow-x-auto scroll-thin", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={clsx(
            "px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
            value === it.value ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col min-w-0", className)}>
      <span className="text-[10px] uppercase tracking-wider text-faint whitespace-nowrap">{label}</span>
      <span className="num text-xs text-fg whitespace-nowrap">{value}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-center py-10 text-xs text-muted text-center px-4">{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx("inline-block h-3 w-3 rounded-full border-2 border-accent/30 border-t-accent animate-spin", className)} />;
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "warn" | "short" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        tone === "default" && "bg-raised text-muted",
        tone === "accent" && "bg-accent/10 text-accent",
        tone === "warn" && "bg-warn/10 text-warn",
        tone === "short" && "bg-short/10 text-short",
      )}
    >
      {children}
    </span>
  );
}
