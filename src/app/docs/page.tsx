import { COLLATERAL, LINKS, robinhood } from "@/lib/config";

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
    ["orders", "Orders"], ["risk", "Margin, liquidation & funding"], ["security", "Security"], ["limits", "Known limitations"],
  ];
  return (
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
          <p><b className="text-fg">{robinhood.name}</b> is Robinhood&apos;s Arbitrum Orbit Layer 2 on Ethereum and uses ETH for gas. You connect your EVM wallet on {robinhood.name}, and that address is your Elyperp account.</p>
          <p><b className="text-fg">Execution</b> happens on Orderly Network&apos;s shared central limit order book. Elyperp is a non-custodial front end: your collateral sits in Orderly&apos;s vault contract, never with Elyperp, and orders go straight from your browser to Orderly.</p>
          <p><b className="text-fg">Market data</b> (prices, order books, trades, candles, funding and open interest) streams live from Orderly. The market list refreshes every minute, so new listings show up on their own. Prices are flagged stale whenever the live feed stops.</p>
        </S>

        <S id="onboarding" title="Getting started">
          <ol className="list-decimal pl-5 flex flex-col gap-1.5">
            <li>Connect MetaMask, Rabby or another EVM wallet (or WalletConnect) and switch to {robinhood.name} when prompted.</li>
            <li><b className="text-fg">Create account</b>: sign one message to register your address with Elyperp on Orderly. It&apos;s free and sends no transaction.</li>
            <li><b className="text-fg">Enable trading</b>: sign once to create a trading key in your browser. It can place and cancel orders but cannot withdraw. It lasts up to a year.</li>
            <li>Deposit {COLLATERAL.symbol} from {robinhood.name}, then trade.</li>
          </ol>
        </S>

        <S id="funds" title="Deposits & withdrawals">
          <p>Collateral is <b className="text-fg">{COLLATERAL.symbol}</b> on {robinhood.name} (token <span className="num text-fg break-all">{COLLATERAL.address}</span>). Depositing is two wallet transactions the first time (approve, then deposit), with a small network fee in ETH. Deposits are credited once Orderly confirms them.</p>
          <p>Withdrawals go back to your connected address on {robinhood.name}. Orderly charges a small withdrawal fee in {COLLATERAL.symbol}. The Withdraw tab shows exactly how much you can withdraw right now.</p>
          <p>Need {COLLATERAL.symbol} on {robinhood.name}? Use one of the bridges Robinhood lists in its <a className="text-accent" href={LINKS.robinhoodBridging} target="_blank" rel="noreferrer">bridging guide</a>.</p>
        </S>

        <S id="markets" title="Markets">
          <p>Elyperp shows every market on Orderly&apos;s order book: crypto, US stocks, indices, commodities and FX. Most are listed by Orderly itself. Some are listed by other builders on Orderly; those show the builder&apos;s name next to the ticker, and that builder sets the market&apos;s oracle and parameters.</p>
          <p><b className="text-fg">Real-world-asset markets</b> (stocks, indices, commodities, FX) follow the underlying market&apos;s trading session. The market bar shows whether the session is open and when it next opens or closes. Outside the session, orders may be rejected and prices can gap at the open.</p>
          <p>Markets in reduce-only, post-only or delisting status are labelled; inactive markets can&apos;t be traded.</p>
        </S>

        <S id="orders" title="Orders">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li><b className="text-fg">Market</b>: fills immediately against the book. The order form shows the estimated slippage before you send it.</li>
            <li><b className="text-fg">Limit</b>: GTC, IOC, FOK or post-only.</li>
            <li><b className="text-fg">Reduce-only</b>: can only shrink an existing position.</li>
            <li><b className="text-fg">Take-profit / Stop-loss</b>: trigger on the mark price. They can be attached to a new order or set on an open position, where they close the whole position.</li>
            <li><b className="text-fg">Close / partial close</b>: reduce-only orders for 1–100% of a position, at market or at a limit price.</li>
          </ul>
          <p>Sizes and prices are checked against each market&apos;s minimum order value, size step, price tick and allowed price range before signing. Every order shows Orderly&apos;s real response.</p>
        </S>

        <S id="risk" title="Margin, liquidation & funding">
          <p>Leverage and margin mode (cross or isolated) are set per market on your account. The liquidation price shown before you trade is an estimate; once a position is open, Elyperp shows Orderly&apos;s own figure, and the position row warns you when the mark price gets within 5% of it.</p>
          <p>Funding is exchanged between longs and shorts at the end of each market&apos;s funding period (it varies by market and is shown in the market bar). The header shows the estimated rate and a countdown to the next payment.</p>
        </S>

        <S id="security" title="Security">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Elyperp never asks for your seed phrase or private key.</li>
            <li>The trading key is generated in your browser and stored in this browser&apos;s local storage. It cannot withdraw funds; withdrawals always need a signature from your wallet. Forget it from the wallet menu at any time.</li>
            <li>No API secrets are needed. All configuration is public (<code>NEXT_PUBLIC_*</code>).</li>
          </ul>
        </S>

        <S id="limits" title="Known limitations">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Deposits and withdrawals are {COLLATERAL.symbol} on {robinhood.name} only. Other assets need to be bridged and swapped first.</li>
            <li>Charts use TradingView Lightweight Charts. Drawing tools are limited to horizontal price lines.</li>
            <li>Builder-listed markets depend on the listing builder&apos;s settings, which Elyperp doesn&apos;t control.</li>
          </ul>
        </S>
      </div>
    </div>
  );
}
