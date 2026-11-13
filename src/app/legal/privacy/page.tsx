import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/site/LegalPage";
import { robinhood } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy Policy | Elyperp" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Elyperp has no sign-up, no email collection and no analytics or advertising trackers. This page explains the little data that is involved when you use it."
    >
      <Section n={1} title="What we don't collect">
        <p>We don&apos;t ask for your name, email, phone number or ID documents, and we don&apos;t run analytics, ad pixels or tracking cookies.</p>
      </Section>

      <Section n={2} title="What stays in your browser">
        <ul>
          <li><b>Trading key.</b> If you enable trading, a trading key is created and stored in your browser&apos;s local storage. It never reaches our servers. Remove it from the wallet menu, or by clearing site data.</li>
          <li><b>Preferences.</b> Favourite markets and order settings such as slippage are saved in local storage on your device.</li>
          <li><b>Wallet connection.</b> Your wallet software may remember that you connected to Elyperp.</li>
        </ul>
      </Section>

      <Section n={3} title="What other services see">
        <p>Elyperp runs in your browser and talks directly to these services, which receive your IP address and the data needed to do their job:</p>
        <ul>
          <li><b>Lighter</b> receives your wallet address, Lighter account number, signed orders and requests for your balances, positions and history.</li>
          <li><b>{robinhood.name} RPC providers</b> receive your wallet address and the transactions you sign. Transactions on {robinhood.name} are public and permanent.</li>
          <li><b>WalletConnect</b>, if you use it, relays messages between Elyperp and your wallet app.</li>
          <li><b>Vercel</b>, our host, processes standard request logs (such as IP address, browser type and pages requested) to serve and protect the site.</li>
        </ul>
        <p>Each of these services has its own privacy policy. We don&apos;t control what they collect or keep.</p>
      </Section>

      <Section n={4} title="How we use data">
        <p>Only to run, secure and fix the site. We don&apos;t sell data, share it for advertising, or build profiles of users.</p>
      </Section>

      <Section n={5} title="Public blockchain data">
        <p>Deposits, withdrawals and other on-chain activity are recorded publicly on {robinhood.name} and can be linked to your wallet address by anyone. This can&apos;t be deleted by us or anyone else.</p>
      </Section>

      <Section n={6} title="Your choices">
        <ul>
          <li>Disconnect your wallet at any time from the wallet menu.</li>
          <li>Clear Elyperp&apos;s site data in your browser to remove everything stored locally.</li>
          <li>Use a different wallet address if you don&apos;t want your activity linked to an existing one.</li>
        </ul>
      </Section>

      <Section n={7} title="Children">
        <p>Elyperp is not for anyone under 18.</p>
      </Section>

      <Section n={8} title="Changes">
        <p>We may update this policy. The date at the top shows the latest version.</p>
      </Section>
    </LegalPage>
  );
}
