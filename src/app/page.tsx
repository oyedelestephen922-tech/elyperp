"use client";
import clsx from "clsx";
import Link from "next/link";
import { useMemo } from "react";
import { CATEGORY_LABEL, type Market, type MarketCategory } from "@/lib/lighter/markets";
import { change24, fmtCompact, fmtPct, fmtPx, marketPath, pnlClass } from "@/lib/format";
import { COLLATERAL, robinhood } from "@/lib/config";
import { useMarkets } from "@/store/markets";
import { Spinner } from "@/components/ui/primitives";
import { SiteFooter } from "@/components/site/SiteFooter";
import { AnimatedLogo } from "@/components/site/AnimatedLogo";

const FEATURED = ["BTC", "ETH", "NVDA", "TSLA", "XAU", "SPY", "OPENAI", "SOL"];
const CATS: MarketCategory[] = ["crypto", "stock", "etf", "commodity", "private"];

export default function Home() {
  const markets = useMarkets((s) => s.markets);
  const loaded = useMarkets((s) => s.loaded);
  const list = useMemo(() => Object.values(markets), [markets]);
  const featured = FEATURED.map((s) => markets[s]).filter(Boolean) as Market[];
  const counts = useMemo(() => {
    const c: Partial<Record<MarketCategory, number>> = {};
    for (const m of list) c[m.category] = (c[m.category] ?? 0) + 1;
    return c;
  }, [list]);
  const volume = list.reduce((a, m) => a + (m.ctx?.amount24 ?? 0), 0);
  const maxLev = list.reduce((a, m) => Math.max(a, m.maxLeverage), 0);

  return (
    <div className="flex flex-col">
      {/* hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 opacity-[0.35] pointer-events-none [background-image:linear-gradient(#121815_1px,transparent_1px)] [background-size:100%_64px]" />
        <div className="relative max-w-6xl mx-auto px-4 md:px-8 py-14 md:py-24 grid gap-12 lg:grid-cols-[1.15fr_1fr] items-center">
          <div className="flex flex-col gap-6">
            <div className="lg:hidden flex flex-col items-center -mt-6 -mb-2">
              <AnimatedLogo size={120} />
              <span className="ely-wordmark -mt-10 text-5xl font-semibold tracking-tight">Ely<span className="ely-perp">perp</span></span>
            </div>
            <span className="self-start rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] text-accent">
              Live on {robinhood.name}
            </span>
            <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
              Trade crypto, stocks<br className="hidden md:block" /> and gold. <span className="text-accent">Any hour.</span>
            </h1>
            <p className="text-base md:text-lg text-muted max-w-xl leading-relaxed">
              Elyperp is a perpetuals exchange on {robinhood.name}. Go long or short on Bitcoin, Nvidia, Tesla, the S&amp;P 500 and more,
              around the clock, with your funds held in your own account, never by us.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/trade/BTC" className="rounded-md bg-accent text-black px-5 py-3 text-sm font-semibold hover:bg-[#2ef09d]">Start trading</Link>
              <Link href="/markets" className="rounded-md border border-line-2 px-5 py-3 text-sm font-medium text-fg hover:border-accent/50">Browse markets</Link>
            </div>
            <dl className="grid grid-cols-3 gap-4 pt-4 max-w-lg">
              <HeroStat label="Markets" value={loaded ? String(list.length) : null} />
              <HeroStat label="24h volume" value={loaded ? fmtCompact(volume) : null} />
              <HeroStat label="Max leverage" value={loaded ? `${maxLev}x` : null} />
            </dl>
          </div>

          <div className="flex flex-col items-center gap-2 lg:-mt-10">
          <div className="hidden lg:flex flex-col items-center">
            <AnimatedLogo size={150} />
            <span className="ely-wordmark -mt-12 text-5xl md:text-6xl font-semibold tracking-tight">Ely<span className="ely-perp">perp</span></span>
          </div>
          <div className="panel overflow-hidden w-full lg:mt-6">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line text-xs">
              <span className="text-muted">Live prices</span>
              <span className="flex items-center gap-1.5 text-faint"><span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />streaming</span>
            </div>
            {!featured.length ? (
              <div className="grid place-items-center py-16"><Spinner /></div>
            ) : (
              <ul>
                {featured.map((m) => {
                  const ch = change24(m.ctx);
                  return (
                    <li key={m.symbol} className="border-t border-line first:border-t-0">
                      <Link href={marketPath(m.slug)} className="flex items-center gap-3 px-4 py-3 hover:bg-panel-2">
                        <span className="w-24 shrink-0">
                          <span className="block font-medium text-sm">{m.base}</span>
                          <span className="block text-[11px] text-faint truncate">{m.name ?? CATEGORY_LABEL[m.category]}</span>
                        </span>
                        <span className="flex-1 text-right num text-sm">{fmtPx(m.ctx?.markPx ?? null, m.pxDecimals)}</span>
                        <span className={clsx("w-20 text-right num text-xs", pnlClass(ch))}>{ch == null ? "--" : fmtPct(ch)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          </div>
        </div>
      </section>

      {/* categories */}
      <section className="max-w-6xl w-full mx-auto px-4 md:px-8 py-16">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">One account, every market</h2>
        <p className="text-muted mt-2 max-w-2xl">Deposit {COLLATERAL.symbol} once and use it as margin across everything listed.</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CATS.map((c) => (
            <Link key={c} href="/markets" className="panel p-4 hover:border-accent/40 transition-colors flex flex-col gap-1">
              <span className="num text-2xl text-fg">{loaded ? counts[c] ?? 0 : "·"}</span>
              <span className="text-sm text-fg">{CATEGORY_LABEL[c]}</span>
              <span className="text-xs text-faint">{CAT_HINT[c]}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* features */}
      <section className="border-y border-line bg-panel">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-16 grid gap-10 md:grid-cols-3">
          <Feature title="Open all the time" body="Stocks and ETFs trade 24/7 here, including nights and weekends when traditional markets are shut." />
          <Feature title="Your funds stay yours" body={`Collateral sits in Lighter's contract on ${robinhood.name} under your wallet. Elyperp never holds it and withdrawals only go back to your address.`} />
          <Feature title="One signature, then trade" body="Sign once to enable trading in your browser. After that, orders go through instantly with no wallet pop-ups." />
          <Feature title="Real order book" body="Orders match on Lighter's central limit order book, with live depth, trades and hourly funding." />
          <Feature title="Proper risk tools" body="Market and limit orders, post-only, reduce-only, take-profit and stop-loss, partial closes, cross or isolated margin." />
          <Feature title="Zero fees on Standard accounts" body="Lighter charges no trading fees on Standard accounts. You only pay small network fees in ETH to move funds." />
        </div>
      </section>

      {/* how it works */}
      <section className="max-w-6xl w-full mx-auto px-4 md:px-8 py-16">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Start in three steps</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          <Step n={1} title="Connect a wallet" body={`MetaMask, Rabby or any EVM wallet on ${robinhood.name}. Gas is paid in ETH.`} />
          <Step n={2} title={`Deposit ${COLLATERAL.symbol}`} body="Your first deposit opens your trading account. It appears within a couple of minutes." />
          <Step n={3} title="Enable trading" body="Sign one message, pick a market and place your first order." />
        </ol>
      </section>

      {/* faq */}
      <section className="border-t border-line">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-16">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Questions</h2>
          <div className="mt-6 flex flex-col divide-y divide-line">
            <Faq q="What is a perpetual future?" a="A contract that tracks an asset's price with no expiry date. You can go long or short with leverage. A funding payment between longs and shorts each hour keeps the contract close to the real price." />
            <Faq q="Do I own the stock when I trade NVDA or TSLA?" a="No. Stock perps are synthetic contracts that follow the price. You get price exposure, not shares, dividends or voting rights." />
            <Faq q="Who holds my money?" a={`Your ${COLLATERAL.symbol} sits in Lighter's contract on ${robinhood.name}, linked to your wallet. Elyperp is the interface and never has access to your funds.`} />
            <Faq q="What does it cost?" a="Lighter charges no trading fees on Standard accounts. You pay or receive hourly funding on open positions and small ETH network fees for deposits." />
            <Faq q="Can I lose more than I put in?" a="Your loss on a position is limited to the margin backing it, but with leverage that can happen quickly. In cross margin, all your collateral backs your positions. Read the Risk Disclosure before trading." />
          </div>
        </div>
      </section>

      {/* final cta */}
      <section className="border-t border-line">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Markets are open.</h2>
            <p className="text-muted mt-2">They always are.</p>
          </div>
          <Link href="/trade/BTC" className="rounded-md bg-accent text-black px-6 py-3 text-sm font-semibold hover:bg-[#2ef09d]">Open the app</Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

const CAT_HINT: Record<MarketCategory, string> = {
  crypto: "BTC, ETH, SOL and more",
  stock: "Nvidia, Tesla, Apple, SpaceX",
  etf: "S&P 500, Nasdaq-100, T-bills",
  commodity: "Gold and silver",
  private: "OpenAI, Anthropic, Shein",
  other: "",
};

function HeroStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-faint">{label}</dt>
      <dd className="num text-xl mt-1">{value ?? <Spinner />}</dd>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-fg font-medium">{title}</h3>
      <p className="text-sm text-muted mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="panel p-5 flex flex-col gap-2">
      <span className="h-7 w-7 rounded-full bg-accent text-black text-xs font-semibold grid place-items-center">{n}</span>
      <h3 className="text-fg font-medium mt-1">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{body}</p>
    </li>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group py-4">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-fg">
        {q}
        <span className="text-muted transition-transform group-open:rotate-45">+</span>
      </summary>
      <p className="text-sm text-muted mt-3 leading-relaxed">{a}</p>
    </details>
  );
}
