import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { TopNav } from "@/components/nav/TopNav";

export const metadata: Metadata = {
  title: "Elyperp | Perps on Elysium",
  description: "Trade crypto, stock and index perpetuals on Hyperliquid infrastructure.",
};

export const viewport: Viewport = { themeColor: "#050706", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased min-h-dvh flex flex-col">
        <Providers>
          <TopNav />
          <main className="flex-1 min-h-0 flex flex-col">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
