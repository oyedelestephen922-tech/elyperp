import { TradeTerminal } from "@/components/trade/TradeTerminal";
import { pathToCoin } from "@/lib/hl/markets";

export default async function TradePage({ params }: { params: Promise<{ market: string[] }> }) {
  const { market } = await params;
  return <TradeTerminal coin={pathToCoin(market)} />;
}
