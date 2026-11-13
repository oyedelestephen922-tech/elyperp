import { COLLATERAL, LIGHTER, LINKS, robinhood } from "@/lib/config";
import { SiteFooter } from "@/components/site/SiteFooter";

export const metadata = { title: "Docs | Elyperp" };

const S = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-20">
    <h2 className="text-base font-semibold text-fg mb-2">{title}</h2>
    <div className="text-sm text-muted leading-relaxed flex flex-col gap-2">{children}</div>
  </section>
);

export default function DocsPage() {
  const toc = [
    ["architecture", "How Elyperp works"], ["onboarding", "Getting started"], ["funds", "Deposits & withdrawals"], ["markets", "Markets"],
    ["orders", "Orders"], ["risk", "Margin, liquidation & funding"], ["fees", "Fees"], ["security", "Security"], ["limits", "Known limitations"],
  ];
  return (
    <>
    <div className="p-4 md:p-8 max-w-5xl w-full mx-auto grid md:grid-cols-[180px_1fr] gap-8">
      <nav className="hidden md:flex flex-col gap-1 text-xs sticky top-20 self-start">
        {toc.map(([id, t]) => <a key={id} href={`#${id}`} className="text-muted hover:text-accent py-1">{t}</a>)}
      </nav>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold">Documentation</h1>
          <p className="text-sm text-muted mt-1">{robinhood.name} · chain ID {robinhood.id} · collateral {COLLATERAL.symbol}</p>
        </div>

        <S id="architecture" title="How Elyperp works">
          <p><b className="text-fg">{robinhood.name}</b> is Robinhood&apos;s Arbitrum Orbit Layer 2 on Ethereum and uses ETH for gas. You connect your EVM wallet on {robinhood.name}, and that address owns your trading account.</p>
          <p><b className="text-fg">Execution</b> happens on Lighter&apos;s order book for {robinhood.name}. Elyperp is a non-custodial front end: your collateral sits in Lighter&apos;s contract on {robinhood.name} (<span className="num text-fg break-all">{LIGHTER.contract}</span>), never with Elyperp, and orders are signed in your browser and sent straight to Lighter.</p>
          <p><b className="text-fg">Market data</b> (prices, order books, trades, candles, funding and open interest) streams live from Lighter. The market list refreshes every minute, so new listings show up on their own. Prices are flagged stale whenever the live feed stops.</p>
        </S>

        <S id="onboarding" title="Getting started">
          <ol className="list-decimal pl-5 flex flex-col gap-1.5">
            <li>Connect MetaMask, Rabby or another EVM wallet (or WalletConnect) and switch to {robinhood.name} when prompted.</li>
            <li><b className="text-fg">Deposit {COLLATERAL.symbol}</b>: approve, then deposit. Your first deposit opens your Lighter account; it shows up a minute or two after the deposit confirms. If you already use Lighter on {robinhood.name} with this wallet, Elyperp finds your account.</li>
            <li><b className="text-fg">Enable trading</b>: sign one message to register a trading key for this browser. From then on orders don&apos;t need a wallet pop-up.</li>
            <li>Pick a market and trade.</li>
          </ol>
          <p>Lighter doesn&apos;t accept orders from restricted regions, including the United States and the United Kingdom. Lighter checks this itself on every order.</p>
        </S>

        <S id="funds" title="Deposits & withdrawals">
          <p>Collateral is <b className="text-fg">{COLLATERAL.symbol}</b> on {robinhood.name} (token <span className="num text-fg break-all">{COLLATERAL.address}</span>). Depositing is two wallet transactions the first time (approve, then deposit), with a small network fee in ETH.</p>
          <p>Withdrawals always go to your connected address on {robinhood.name}. The minimum is {COLLATERAL.minWithdraw} {COLLATERAL.symbol}, and the Withdraw tab shows how much is available right now.</p>
          <p>Need {COLLATERAL.symbol} on {robinhood.name}? Use one of the bridges Robinhood lists in its <a className="text-accent" href={LINKS.robinhoodBridging} target="_blank" rel="noreferrer">bridging guide</a>.</p>
        </S>

        <S id="markets" title="Markets">
          <p>Elyperp shows every perpetual market on Lighter&apos;s {robinhood.name} exchange: crypto, US stocks, ETFs, gold and silver, and a few pre-IPO companies.</p>
          <p><b className="text-fg">Pre-IPO markets</b> track an implied valuation of a private company. They are not shares and can move sharply.</p>
          <p>Markets in reduce-only or frozen status are labelled.</p>
        </S>

        <S id="orders" title="Orders">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li><b className="text-fg">Market</b>: fills right away against the book, with a maximum slippage you choose (0.25% to 5%). Anything that can&apos;t fill inside it is cancelled.</li>
            <li><b className="text-fg">Limit</b>: good till cancelled (up to 28 days), IOC or post-only.</li>
            <li><b className="text-fg">Reduce-only</b>: can only shrink an existing position.</li>
            <li><b className="text-fg">Take-profit / Stop-loss</b>: trigger on the mark price. Attach them to a new order (they activate once it fills), or set them on an open position.</li>
            <li><b className="text-fg">Close / partial close</b>: reduce-only orders for 1–100% of a position, at market or at a limit price.</li>
          </ul>
          <p>Sizes and prices are checked against each market&apos;s minimum size, minimum order value and decimals before signing. Every order shows Lighter&apos;s real response.</p>
        </S>

        <S id="risk" title="Margin, liquidation & funding">
          <p>Leverage and margin mode (cross or isolated) are set per market on your account. Once a position is open, Elyperp shows Lighter&apos;s liquidation price, and the position row warns you when the mark price gets within 5% of it.</p>
          <p>Funding is exchanged between longs and shorts every hour. The market bar shows the current hourly rate and a countdown to the next payment.</p>
        </S>

        <S id="fees" title="Fees">
          <p>Lighter charges no trading fees on Standard accounts. Plus and Premium accounts pay Lighter&apos;s tier fees. Elyperp adds nothing on Standard accounts. Plus and Premium holders can choose to approve a small Elyperp builder fee; nothing is charged without that approval.</p>
        </S>

        <S id="security" title="Security">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Elyperp never asks for your seed phrase or private key.</li>
            <li>The trading key is generated in your browser by Lighter&apos;s own signer and stored in this browser&apos;s local storage. It can place and cancel orders and withdraw to your own wallet address only. Forget it from the wallet menu at any time.</li>
            <li>No API secrets are needed. All configuration is public (<code>NEXT_PUBLIC_*</code>).</li>
          </ul>
        </S>

        <S id="limits" title="Known limitations">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Deposits and withdrawals are {COLLATERAL.symbol} on {robinhood.name} only. Other assets need to be bridged and swapped first.</li>
            <li>Charts use TradingView Lightweight Charts. Drawing tools are limited to horizontal price lines.</li>
            <li>History shows your 100 most recent fills and funding payments.</li>
          </ul>
        </S>
      </div>
    </div>
    <SiteFooter />
    </>
  );
}
