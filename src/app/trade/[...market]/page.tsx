import { TradeTerminal } from "@/components/trade/TradeTerminal";

export default async function TradePage({ params }: { params: Promise<{ market: string[] }> }) {
  const { market } = await params;
  // /trade/BTC, /trade/AAPL-mythos
  return <TradeTerminal slug={market.map(decodeURIComponent).join("-")} />;
}
