import { elysium, HL_NETWORK, LINKS } from "@/lib/config";

export const metadata = { title: "Docs | Elyperp" };

const S = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-20">
    <h2 className="text-base font-semibold text-fg mb-2">{title}</h2>
    <div className="text-sm text-muted leading-relaxed flex flex-col gap-2">{children}</div>
  </section>
);

export default function DocsPage() {
  const toc = [
    ["architecture", "How Elyperp works"], ["onboarding", "Getting started"], ["markets", "Markets"],
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
          <p className="text-sm text-muted mt-1">Running on Hyperliquid <b className="text-fg">{HL_NETWORK}</b> · Elysium chain ID {elysium.id}</p>
        </div>

        <S id="architecture" title="How Elyperp works">
          <p><b className="text-fg">Execution</b> happens on Hyperliquid&apos;s HyperCore order books. Elyperp never holds your funds. Orders are signed in your browser and sent straight to Hyperliquid.</p>
          <p><b className="text-fg">Elysium</b> is Kinetiq&apos;s Arbitrum Orbit chain that settles to HyperEVM and uses HYPE for gas. Elyperp connects EVM wallets on Elysium, and your same EVM address is your Hyperliquid account.</p>
          <p><b className="text-fg">Market data</b> (all markets, prices, order books, trades, candles, funding and open interest) streams live from Hyperliquid. Market discovery runs through Elyperp&apos;s backend with short caching. Prices are flagged stale whenever the live feed stops.</p>
        </S>

        <S id="onboarding" title="Getting started">
          <ol className="list-decimal pl-5 flex flex-col gap-1.5">
            <li>Connect MetaMask, Rabby or another EVM wallet (WalletConnect when configured). Switch to Elysium when prompted.</li>
            <li>Fund your Hyperliquid account with USDC. Connecting a wallet does not create an account by itself. Supported routes:
              <ul className="list-disc pl-5 mt-1">
                <li><a className="text-accent" href={LINKS.hyperliquidDeposit} target="_blank" rel="noreferrer">Arbitrum USDC → Hyperliquid bridge</a> (minimum 5 USDC).</li>
                <li><a className="text-accent" href={LINKS.circleHyperEvmToCore} target="_blank" rel="noreferrer">HyperEVM USDC → HyperCore</a> through Circle&apos;s CoreDepositWallet.</li>
                <li>From Elysium: bridge to HyperEVM with Elysium&apos;s canonical bridge, then use the HyperEVM route. A direct Elysium → HyperCore lane is planned by Kinetiq after mainnet. Elyperp will add it once audited contract addresses are published.</li>
              </ul>
            </li>
            <li>Click <b className="text-fg">Enable trading</b> and sign once. This approves a browser-generated trading key that can place and cancel orders but cannot withdraw.</li>
            <li>Optional: enable HIP-3 dex abstraction so stock and index markets can use your main USDC balance.</li>
          </ol>
        </S>

        <S id="markets" title="Markets">
          <p>The market list isn&apos;t hardcoded. Elyperp pulls every dex from <code>perpDexs</code> and <code>allPerpMetas</code> and refreshes every 5 minutes, so new listings show up on their own. Categories come from Hyperliquid&apos;s <code>perpCategories</code>; anything it can&apos;t place goes under &quot;Other HIP-3&quot;.</p>
          <p><b className="text-fg">Stocks and indices</b> are HIP-3 builder-deployed perpetuals. They are always shown with their dex namespace (for example <code>xyz:NVDA</code>), because two dexes can list the same ticker with different oracles, collateral and fees. The deployer controls the oracle, off-hours pricing and any halts. The market bar shows the deployer, the collateral token and the US session status.</p>
          <p>Markets that are delisted, or that have no valid mark/oracle price, are labelled and cannot be traded.</p>
        </S>

        <S id="orders" title="Orders">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li><b className="text-fg">Market</b>: an immediate-or-cancel limit order at mid ± your slippage tolerance. Any part that cannot fill inside that band is cancelled and reported as partially filled.</li>
            <li><b className="text-fg">Limit</b>: GTC, IOC or post-only (ALO).</li>
            <li><b className="text-fg">Reduce-only</b>: can only shrink an existing position.</li>
            <li><b className="text-fg">Take-profit / Stop-loss</b>: trigger orders that execute as reduce-only market orders. They can be attached to a new order or set on an open position.</li>
            <li><b className="text-fg">Close / partial close</b>: reduce-only orders for 1–100% of a position, at market or at a limit price.</li>
          </ul>
          <p>Sizes are rounded down to each market&apos;s lot size, and prices are checked against Hyperliquid&apos;s tick rules (5 significant figures, at most 6 − szDecimals decimals) before signing. Every order shows the exchange&apos;s real response: open, filled, partially filled, rejected (with the reason) or failed.</p>
        </S>

        <S id="risk" title="Margin, liquidation & funding">
          <p>Leverage and margin mode (cross/isolated) are set per market on your Hyperliquid account. Some HIP-3 markets are isolated-only. The liquidation price shown before you trade is an estimate based on base-tier maintenance margin (half the initial margin at max leverage). Larger positions can hit higher maintenance tiers. Once a position is open, Elyperp shows Hyperliquid&apos;s own liquidation price.</p>
          <p>Funding is paid hourly. The header shows the current hourly rate and a countdown to the next payment.</p>
        </S>

        <S id="security" title="Security">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Elyperp never asks for your seed phrase or private key.</li>
            <li>The trading key is generated in your browser and stored in this browser&apos;s local storage. It cannot withdraw funds. Revoke it from the wallet menu, or by approving a new key.</li>
            <li>No API secrets are needed. All configuration is public (<code>NEXT_PUBLIC_*</code>).</li>
          </ul>
        </S>

        <S id="limits" title="Known limitations">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>There is no in-app Elysium → Hyperliquid bridge yet; see Getting started for the supported routes.</li>
            <li>Charts use TradingView Lightweight Charts. Drawing tools are limited to horizontal price lines; the full Advanced Charts library needs a TradingView license.</li>
            <li>HIP-3 dexes that use a non-USDC collateral token need that token in your account.</li>
          </ul>
        </S>
      </div>
    </div>
  );
}
