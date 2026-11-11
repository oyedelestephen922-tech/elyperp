"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/ui/primitives";
import { WalletButton } from "./WalletButton";

const LINKS = [
  { href: "/trade/BTC", match: "/trade", label: "Trade" },
  { href: "/markets", match: "/markets", label: "Markets" },
  { href: "/portfolio", match: "/portfolio", label: "Portfolio" },
  { href: "/history", match: "/history", label: "Trade History" },
  { href: "/docs", match: "/docs", label: "Documentation" },
];

export function TopNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur">
      <div className="flex items-center h-12 px-3 gap-4">
        <Link href="/trade/BTC" aria-label="Elyperp home"><Logo /></Link>
        <nav className="hidden md:flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "px-2.5 py-1.5 rounded text-[13px] transition-colors",
                path.startsWith(l.match) ? "text-fg bg-raised" : "text-muted hover:text-fg",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        <WalletButton />
        <button className="md:hidden text-muted px-1" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰</button>
      </div>
      {open && (
        <nav className="md:hidden border-t border-line px-2 py-2 flex flex-col">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
              className={clsx("px-3 py-2 rounded text-sm", path.startsWith(l.match) ? "text-fg bg-raised" : "text-muted")}>
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
