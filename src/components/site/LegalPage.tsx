import Link from "next/link";
import { LEGAL_UPDATED } from "@/lib/config";
import { SiteFooter } from "./SiteFooter";

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <>
      <article className="max-w-3xl w-full mx-auto px-4 md:px-8 py-10">
        <nav className="flex gap-3 text-xs text-muted mb-6">
          <Link href="/legal/terms" className="hover:text-fg">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-fg">Privacy</Link>
          <Link href="/legal/risk" className="hover:text-fg">Risk</Link>
        </nav>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-xs text-faint mt-2">Last updated {LEGAL_UPDATED}</p>
        <p className="text-sm text-muted mt-5 leading-relaxed">{intro}</p>
        <div className="mt-8 flex flex-col gap-8">{children}</div>
      </article>
      <SiteFooter />
    </>
  );
}

export function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-fg mb-2">{n}. {title}</h2>
      <div className="text-sm text-muted leading-relaxed flex flex-col gap-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1 [&_b]:text-fg [&_b]:font-medium">{children}</div>
    </section>
  );
}
