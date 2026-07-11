import "server-only";

/** Map TradingView tickers (incl. CAPITALCOM:US500) to METS/Capital symbols. */
export function normalizeTradingViewSymbol(raw: string): string {
  const s = raw.trim().toUpperCase();
  const colon = s.includes(":") ? s.split(":").pop()! : s;
  const map: Record<string, string> = {
    ES: "US500",
    NQ: "US100",
    GC: "GOLD",
    YM: "US30",
    BTC: "BTCUSD",
    XAUUSD: "GOLD",
    SPX: "US500",
  };
  return map[colon] ?? colon;
}

export function parseTradingViewAction(
  raw: string | undefined,
  message?: string
): "BUY" | "SELL" {
  const text = `${raw ?? ""} ${message ?? ""}`.toLowerCase();
  if (/\b(sell|short|bear)\b/.test(text)) return "SELL";
  if (/\b(buy|long|bull)\b/.test(text)) return "BUY";
  return "BUY";
}

export function parseTradingViewTimeframe(interval: string | undefined): string {
  if (!interval) return "TV";
  const n = interval.trim();
  if (/^\d+$/.test(n)) return `${n}m`;
  return n;
}
