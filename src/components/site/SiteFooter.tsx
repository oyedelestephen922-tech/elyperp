import Link from "next/link";
import { Logo } from "@/components/ui/primitives";
import { LINKS, SOCIAL } from "@/lib/config";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line mt-auto">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 grid gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr] text-sm">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="text-muted max-w-xs">Perpetuals on Robinhood Chain. A non-custodial interface to Lighter&apos;s order book.</p>
        </div>
        <Col title="Product">
          <FLink href="/trade/BTC">Trade</FLink>
          <FLink href="/markets">Markets</FLink>
          <FLink href="/portfolio">Portfolio</FLink>
          <FLink href="/docs">Documentation</FLink>
        </Col>
        <Col title="Legal">
          <FLink href="/legal/terms">Terms of Use</FLink>
          <FLink href="/legal/privacy">Privacy Policy</FLink>
          <FLink href="/legal/risk">Risk Disclosure</FLink>
        </Col>
        <Col title="Community">
          {SOCIAL.x && <FLink href={SOCIAL.x} external>X</FLink>}
          {SOCIAL.telegram && <FLink href={SOCIAL.telegram} external>Telegram</FLink>}
          <FLink href={LINKS.lighterApp} external>Lighter</FLink>
          <FLink href={LINKS.robinhoodDocs} external>Robinhood Chain</FLink>
        </Col>
      </div>
      <div className="border-t border-line">
        <p className="max-w-6xl mx-auto px-4 md:px-8 py-4 text-[11px] text-faint leading-relaxed">
          © {year} Elyperp. Perpetual futures are leveraged and can lose you more than you expect, including your whole deposit.
          Nothing on this site is investment advice. Read the <Link href="/legal/risk" className="underline hover:text-muted">Risk Disclosure</Link> before trading.
        </p>
      </div>
    </footer>
  );
}

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-wider text-faint">{title}</div>
      {children}
    </div>
  );
}

function FLink({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className="text-muted hover:text-fg">{children} ↗</a>
  ) : (
    <Link href={href} className="text-muted hover:text-fg">{children}</Link>
  );
}
