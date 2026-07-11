import "server-only";

import { headlineMentionsSymbol } from "./relevance";

const FINNHUB_BASE = "https://finnhub.io/api/v1";

export interface SymbolNewsItem {
  headline: string;
  source: string;
  datetime: number;
  url: string;
  summary?: string;
  /** Headline/summary explicitly names the ticker or a known company alias. */
  mentionsSymbol: boolean;
}

export interface SymbolCatalystResult {
  symbol: string;
  configured: boolean;
  hasCatalyst: boolean;
  newsCount: number;
  headlines: SymbolNewsItem[];
  note: string;
}

function finnhubToken(): string | null {
  const key = process.env.FINNHUB_API_KEY?.trim();
  return key || null;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isFinnhubConfigured(): boolean {
  return Boolean(finnhubToken());
}

/** Map Capital/Lighter tickers to Finnhub company-news symbols (US equities). */
export function finnhubEquitySymbol(symbol: string, assetClass?: string): string | null {
  const s = symbol.trim().toUpperCase();
  if (assetClass && !["shares", "share", "equity", "stock"].includes(assetClass.toLowerCase())) {
    return null;
  }
  if (/^(EUR|USD|GBP|JPY|AUD|CAD|CHF)/.test(s) && s.length <= 6) return null;
  if (["GOLD", "SILVER", "OIL", "US500", "US100", "US30", "UK100", "DE40"].includes(s)) return null;
  return s.replace(/[^A-Z0-9.]/g, "").slice(0, 12) || null;
}

export async function pingFinnhub(): Promise<{
  configured: boolean;
  ok: boolean;
  error?: string;
}> {
  const token = finnhubToken();
  if (!token) {
    return { configured: false, ok: false, error: "FINNHUB_API_KEY not set" };
  }
  try {
    const res = await fetch(
      `${FINNHUB_BASE}/quote?symbol=AAPL&token=${encodeURIComponent(token)}`,
      { next: { revalidate: 60 } }
    );
    if (res.status === 401 || res.status === 403) {
      return { configured: true, ok: false, error: "Invalid Finnhub API key" };
    }
    if (!res.ok) {
      return { configured: true, ok: false, error: `Finnhub HTTP ${res.status}` };
    }
    return { configured: true, ok: true };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message : "Finnhub ping failed",
    };
  }
}

/** Recent company news — catalyst proxy when headlines exist in lookback window. */
export async function fetchSymbolCatalyst(params: {
  symbol: string;
  lookbackDays?: number;
  assetClass?: string;
}): Promise<SymbolCatalystResult> {
  const symbol = params.symbol.trim().toUpperCase();
  const token = finnhubToken();
  if (!token) {
    return {
      symbol,
      configured: false,
      hasCatalyst: false,
      newsCount: 0,
      headlines: [],
      note: "Set FINNHUB_API_KEY in .env for automated news/catalyst checks.",
    };
  }

  const equitySymbol = finnhubEquitySymbol(symbol, params.assetClass);
  if (!equitySymbol) {
    return {
      symbol,
      configured: true,
      hasCatalyst: false,
      newsCount: 0,
      headlines: [],
      note: `${symbol} is not a US equity ticker — Finnhub company-news applies to shares (e.g. TSLA, NVDA).`,
    };
  }

  const lookbackDays = params.lookbackDays ?? 2;
  const to = new Date();
  const from = new Date(to.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const query = new URLSearchParams({
    symbol: equitySymbol,
    from: formatDate(from),
    to: formatDate(to),
    token,
  });

  const res = await fetch(`${FINNHUB_BASE}/company-news?${query.toString()}`, {
    next: { revalidate: 300 },
  });

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1200));
    return fetchSymbolCatalyst(params);
  }

  if (!res.ok) {
    const text = await res.text();
    return {
      symbol,
      configured: true,
      hasCatalyst: false,
      newsCount: 0,
      headlines: [],
      note: `Finnhub error ${res.status}: ${text.slice(0, 120)}`,
    };
  }

  const raw = (await res.json()) as Array<{
    headline?: string;
    source?: string;
    datetime?: number;
    url?: string;
    summary?: string;
  }>;

  const headlines: SymbolNewsItem[] = (raw ?? [])
    .filter((n) => n.headline)
    .slice(0, 12)
    .map((n) => ({
      headline: n.headline!,
      source: n.source ?? "—",
      datetime: n.datetime ?? 0,
      url: n.url ?? "",
      summary: n.summary,
      mentionsSymbol: headlineMentionsSymbol(equitySymbol, n.headline!, n.summary),
    }))
    .sort((a, b) => Number(b.mentionsSymbol) - Number(a.mentionsSymbol));

  const catalystHeadlines = headlines.filter((h) => h.mentionsSymbol);

  return {
    symbol,
    configured: true,
    hasCatalyst: catalystHeadlines.length > 0,
    newsCount: catalystHeadlines.length,
    headlines,
    note:
      catalystHeadlines.length > 0
        ? `${catalystHeadlines.length} catalyst headline(s) for ${equitySymbol} (${headlines.length} in Finnhub feed, ${headlines.length - catalystHeadlines.length} syndicated/generic filtered).`
        : headlines.length > 0
          ? `${headlines.length} Finnhub headline(s) for ${equitySymbol} — none mention the ticker (syndicated feed only).`
          : `No Finnhub headlines for ${equitySymbol} in last ${lookbackDays}d.`,
  };
}

/** Batch catalyst lookup with light rate limiting. */
export async function fetchCatalystBatch(
  symbols: string[],
  lookbackDays = 2
): Promise<Map<string, SymbolCatalystResult>> {
  const out = new Map<string, SymbolCatalystResult>();
  for (const symbol of symbols) {
    out.set(symbol, await fetchSymbolCatalyst({ symbol, lookbackDays }));
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

export interface EconomicCalendarRow {
  country: string;
  event: string;
  impact: "low" | "medium" | "high";
  time: number;
  actual?: string | null;
  estimate?: string | null;
  previous?: string | null;
}

export interface EconomicCalendarResult {
  configured: boolean;
  events: EconomicCalendarRow[];
  note: string;
}

function impactLevel(raw?: string): "low" | "medium" | "high" {
  const v = (raw ?? "").toLowerCase();
  if (v.includes("high") || v === "3") return "high";
  if (v.includes("medium") || v === "2") return "medium";
  return "low";
}

/** Finnhub economic calendar — today + daysAhead. */
export async function fetchEconomicCalendar(params?: {
  daysAhead?: number;
}): Promise<EconomicCalendarResult> {
  const token = finnhubToken();
  const daysAhead = params?.daysAhead ?? 2;
  const from = new Date();
  const to = new Date(from.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  if (!token) {
    return {
      configured: false,
      events: [],
      note: "Set FINNHUB_API_KEY for live economic calendar.",
    };
  }

  const query = new URLSearchParams({
    from: formatDate(from),
    to: formatDate(to),
    token,
  });

  const res = await fetch(`${FINNHUB_BASE}/calendar/economic?${query.toString()}`, {
    next: { revalidate: 600 },
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      configured: true,
      events: [],
      note: `Finnhub calendar error ${res.status}: ${text.slice(0, 120)}`,
    };
  }

  const json = (await res.json()) as {
    economicCalendar?: Array<{
      country?: string;
      event?: string;
      impact?: string;
      time?: string;
      actual?: string;
      estimate?: string;
      prev?: string;
    }>;
  };

  const now = Date.now();
  const events: EconomicCalendarRow[] = (json.economicCalendar ?? [])
    .filter((e) => e.event && e.time)
    .map((e) => ({
      country: e.country ?? "—",
      event: e.event!,
      impact: impactLevel(e.impact),
      time: new Date(e.time!).getTime(),
      actual: e.actual ?? null,
      estimate: e.estimate ?? null,
      previous: e.prev ?? null,
    }))
    .filter((e) => e.time >= now - 60 * 60 * 1000)
    .sort((a, b) => a.time - b.time)
    .slice(0, 12);

  return {
    configured: true,
    events,
    note: events.length
      ? `${events.length} upcoming event(s) from Finnhub.`
      : "No high-impact events in window.",
  };
}
