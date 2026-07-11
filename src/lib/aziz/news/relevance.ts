/** Common company names Finnhub/Yahoo may use instead of the ticker. */
const TICKER_ALIASES: Record<string, string[]> = {
  AAPL: ["APPLE"],
  AMD: ["ADVANCED MICRO"],
  AMZN: ["AMAZON"],
  GOOGL: ["GOOGLE", "ALPHABET"],
  INTC: ["INTEL"],
  META: ["META PLATFORMS", "FACEBOOK"],
  MSFT: ["MICROSOFT"],
  MU: ["MICRON"],
  NVDA: ["NVIDIA"],
  TSLA: ["TESLA"],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textMentions(text: string, term: string): boolean {
  const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
  return re.test(text);
}

/** True when headline or summary explicitly references the ticker (or a known company alias). */
export function headlineMentionsSymbol(
  symbol: string,
  headline: string,
  summary?: string
): boolean {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return false;

  const blob = `${headline}\n${summary ?? ""}`;
  if (textMentions(blob, sym)) return true;

  for (const alias of TICKER_ALIASES[sym] ?? []) {
    if (textMentions(blob, alias)) return true;
  }
  return false;
}
