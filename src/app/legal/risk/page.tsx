import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/site/LegalPage";
import { COLLATERAL, robinhood } from "@/lib/config";

export const metadata: Metadata = { title: "Risk Disclosure | Elyperp" };

export default function RiskPage() {
  return (
    <LegalPage
      title="Risk Disclosure"
      intro="Perpetual futures are complex, leveraged products. Many traders lose money. Only trade with funds you can afford to lose completely, and make sure you understand the risks below."
    >
      <Section n={1} title="Leverage and liquidation">
        <p>Leverage multiplies both gains and losses. At 20x, a 5% move against you can wipe out your initial margin. If your equity falls to the maintenance margin, Lighter liquidates your position automatically, and you can lose all the collateral backing it. In cross margin, losses on one position can liquidate your other positions too.</p>
      </Section>

      <Section n={2} title="Price gaps and volatility">
        <p>Prices can move very fast, gap past your stop-loss or liquidation price, or spike briefly. Stop-loss and take-profit orders are not guaranteed to fill at the trigger price, or at all.</p>
      </Section>

      <Section n={3} title="Stock, ETF, commodity and pre-IPO perps">
        <p>These are synthetic contracts that track a reference price. You don&apos;t own the underlying share, fund or metal, and you get no voting rights, dividends or other shareholder rights. They trade around the clock, including when the underlying market is closed, so prices can drift from the last official price and jump when that market reopens. Pre-IPO markets track an implied valuation of a private company, with no public market price behind it, and can be especially volatile.</p>
      </Section>

      <Section n={4} title="Funding">
        <p>Longs and shorts pay each other funding every hour. Funding can be positive or negative and can add up to a large cost over time.</p>
      </Section>

      <Section n={5} title="Liquidity and slippage">
        <p>Markets can be thin. Large orders can fill at worse prices than shown, and in fast markets the order book may not have enough depth to close a position at a reasonable price.</p>
      </Section>

      <Section n={6} title="Technology and third parties">
        <ul>
          <li>Smart contracts, the Lighter exchange, {robinhood.name}, wallets and Elyperp itself can have bugs, be attacked, or go down. Any of these can cause delays or loss of funds.</li>
          <li>Price feeds can be wrong or delayed, which can trigger liquidations.</li>
          <li>{COLLATERAL.symbol} is a stablecoin and could lose its peg.</li>
          <li>Lighter or other operators can change rules, fees, margin requirements or market listings, freeze or delist markets, or restrict access.</li>
        </ul>
      </Section>

      <Section n={7} title="Your keys and devices">
        <p>If someone gets access to your wallet or the device holding your trading key, they may be able to trade on your account. Transactions can&apos;t be reversed.</p>
      </Section>

      <Section n={8} title="Legal and tax">
        <p>The rules for derivatives and crypto assets differ between countries and can change. You are responsible for knowing and following the rules that apply to you, and for any taxes on your trading.</p>
      </Section>

      <Section n={9} title="No advice">
        <p>Elyperp provides software, not advice. Nothing on the site is a recommendation. If you&apos;re unsure, speak to a qualified adviser before trading.</p>
      </Section>
    </LegalPage>
  );
}
