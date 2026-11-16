import type { Metadata } from "next";
import { Suspense } from "react";
import { Intelligence } from "@/components/intel/Intelligence";
import { SiteFooter } from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: "Intelligence | Elyperp",
  description: "Before you trade, know what you're trading. Token contract security and on-chain analysis, powered by Agent SI.",
};

export default function IntelligencePage() {
  return (
    <>
      <Suspense>
        <Intelligence />
      </Suspense>
      <SiteFooter />
    </>
  );
}
