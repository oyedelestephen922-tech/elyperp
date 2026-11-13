import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/site/LegalPage";
import { COLLATERAL, LIGHTER, LINKS, robinhood } from "@/lib/config";

export const metadata: Metadata = { title: "Terms of Use | Elyperp" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      intro={`These terms cover your use of the Elyperp website and app ("Elyperp", "we", "us"). By using Elyperp you agree to them. If you don't agree, don't use it.`}
    >
      <Section n={1} title="What Elyperp is">
        <p>Elyperp is a software interface. It shows market data and lets you create, sign and send orders to Lighter&apos;s perpetual futures exchange on {robinhood.name}.</p>
        <p>Elyperp is not an exchange, broker, custodian, market maker or financial adviser. We don&apos;t match orders, set prices, hold your funds or take the other side of your trades. Orders are executed by Lighter, and your collateral sits in Lighter&apos;s contract on {robinhood.name} (<span className="num break-all">{LIGHTER.contract}</span>).</p>
      </Section>

      <Section n={2} title="Your wallet and keys">
        <ul>
          <li>You connect your own wallet. You alone control it, its private key and its recovery phrase. We never ask for them and can&apos;t recover them.</li>
          <li>When you enable trading, a trading key is created in your browser and kept in its local storage. It can place and cancel orders and withdraw only to your own wallet address. Anyone with access to your browser may be able to use it, so keep your device secure. You can remove it from the wallet menu at any time.</li>
          <li>Transactions you sign are final. We can&apos;t reverse, cancel or refund them.</li>
        </ul>
      </Section>

      <Section n={3} title="Third-party services">
        <p>Elyperp depends on services we don&apos;t control, including Lighter, {robinhood.name}, the {COLLATERAL.symbol} token, wallet software, RPC providers and hosting. Each has its own terms. Your use of Lighter is also governed by Lighter&apos;s terms and rules, including its own eligibility checks, and Lighter may reject, delay or reverse activity on its own decision.</p>
        <p>We aren&apos;t responsible for outages, bugs, losses, price errors, liquidations, hacks, or changes caused by third-party services, and we don&apos;t guarantee that any of them will stay available.</p>
      </Section>

      <Section n={4} title="Eligibility and lawful use">
        <ul>
          <li>You must be at least 18 and able to enter into a binding agreement.</li>
          <li>You are responsible for making sure that using Elyperp and trading perpetual futures is legal for you where you live and where you are, and for any taxes you owe.</li>
          <li>You won&apos;t use Elyperp to break any law, launder money, finance terrorism, avoid sanctions, manipulate markets, or interfere with the site or with other users.</li>
          <li>You won&apos;t try to get around any access restriction applied by Elyperp or by Lighter.</li>
        </ul>
      </Section>

      <Section n={5} title="Fees">
        <p>Lighter charges its own trading fees and funding according to your Lighter account tier. {robinhood.name} charges network fees in ETH for deposits and approvals. If you choose to approve an Elyperp builder fee, that fee is added to your orders at the rate shown before you approve it. No builder fee applies unless you approve it.</p>
      </Section>

      <Section n={6} title="Risk">
        <p>Trading leveraged perpetual futures is high risk and you can lose all the collateral you deposit. Read the <Link href="/legal/risk" className="text-accent">Risk Disclosure</Link> before trading. Nothing on Elyperp is investment, legal or tax advice, and no information on the site is a recommendation to buy or sell anything.</p>
      </Section>

      <Section n={7} title="No warranty">
        <p>Elyperp is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, express or implied, including fitness for a particular purpose, accuracy of data, and uninterrupted or error-free operation. Prices, balances and estimates shown may be delayed or wrong. Always check before you trade.</p>
      </Section>

      <Section n={8} title="Limitation of liability">
        <p>To the fullest extent the law allows, Elyperp and the people who build it are not liable for any indirect, incidental, special or consequential loss, or for any loss of funds, profits, data or trading opportunity, arising from your use of Elyperp or any third-party service, even if we were told it might happen.</p>
      </Section>

      <Section n={9} title="Indemnity">
        <p>You agree to cover any claims, losses and costs (including reasonable legal fees) that arise from your breach of these terms, your misuse of Elyperp, or your breaking any law or anyone else&apos;s rights.</p>
      </Section>

      <Section n={10} title="Changes and access">
        <p>We may change, pause or stop Elyperp, or any feature or market shown on it, at any time. We may update these terms; the date at the top shows the latest version, and using Elyperp after an update means you accept it. We may block access to the interface at our discretion. Your funds stay in Lighter&apos;s contract and remain reachable through Lighter&apos;s own app ({LINKS.lighterApp.replace("https://", "")}).</p>
      </Section>

      <Section n={11} title="Privacy">
        <p>How we handle data is described in the <Link href="/legal/privacy" className="text-accent">Privacy Policy</Link>.</p>
      </Section>
    </LegalPage>
  );
}
