/** Aziz RAG Stock-in-Play thresholds (adaptable). */
export interface AzizSipThresholds {
  minGapPct: number;
  minRvol: number;
  minPriceUsd: number;
  maxPriceUsd: number;
  minRangeAtrMultiple: number;
  minQuoteVolUsd: number;
}

export const DEFAULT_AZIZ_SIP_THRESHOLDS: AzizSipThresholds = {
  minGapPct: 1.5,
  minRvol: 1.5,
  minPriceUsd: 5,
  maxPriceUsd: 150,
  minRangeAtrMultiple: 1.5,
  minQuoteVolUsd: 50_000,
};

export interface AzizSipScanRow {
  symbol: string;
  marketId: number;
  /** Capital.com epic when scanned via CFD data source */
  epic?: string;
  price: number;
  gapPct: number;
  rvol: number;
  rangeAtrMultiple: number;
  avgDailyQuoteVol: number;
  spreadPct: number | null;
  sessionDate: string;
  sessionLabel: string;
  /** Capital movers list day % change (when available) */
  changePct?: number | null;
  /** Capital.com client long % (when available) */
  longSentimentPct?: number | null;
  /** Which Capital navigation list surfaced this symbol */
  moverSource?: string;
  assetClass?: string;
  activeSession?: string;
  /** Finnhub news catalyst flag (when FINNHUB_API_KEY set) */
  hasCatalyst?: boolean;
  catalystHeadline?: string | null;
  passed: boolean;
  failures: string[];
  score: number;
  ready: boolean;
}

export type AzizSipUniverse =
  | "priority"
  | "equity"
  | "custom"
  | "capital_movers"
  | "capital_gainers"
  | "capital_volatile"
  | "capital_all"
  | "capital_shares"
  | "capital_indices"
  | "capital_commodities"
  | "capital_forex";

export type CapitalScanAssetClass = "all" | "shares" | "indices" | "commodities" | "forex";

export interface AzizSipScanResult {
  scanned: number;
  /** Movers pulled from universe before SIP scoring (may exceed `scanned` when candle fetch fails). */
  moversAttempted?: number;
  qualified: number;
  sessionDate: string;
  universe: string;
  dataSource: "lighter" | "capital";
  thresholds: AzizSipThresholds;
  results: AzizSipScanRow[];
  note: string;
  activeSession?: string;
  scanWindowLabel?: string;
}
