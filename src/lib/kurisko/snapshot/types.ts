import type { K1CriterionStep } from "@/lib/kurisko/backtest/k1-diagnose";

/** QR Pro / Kurisko RAG setup stages. */
export type KuriskoK1Stage = "WATCHING" | "ARM" | "STAGE1" | "DIV" | "CONFIRM" | "SIGNAL";

export const KURISKO_STAGE_FLOW: KuriskoK1Stage[] = [
  "WATCHING",
  "ARM",
  "STAGE1",
  "DIV",
  "CONFIRM",
  "SIGNAL",
];

export interface KuriskoQuadValues {
  A: number;
  B: number;
  C: number;
  D: number;
}

export interface KuriskoQuadDepthBar {
  key: keyof KuriskoQuadValues;
  label: string;
  value: number;
  /** 0–100 bar fill — deeper into OS/OB zone = higher. */
  depth: number;
  inZone: boolean;
}

export interface KuriskoQuadDepths {
  bars: KuriskoQuadDepthBar[];
  deepest: keyof KuriskoQuadValues | null;
  deepestDepth: number;
  allInZone: boolean;
}

export interface KuriskoChartCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface KuriskoKeyLevels {
  upper: number;
  mid: number;
  lower: number;
  slopeDeg: number | null;
}

export interface KuriskoVortexFlux {
  /** 0–100 meter fill. */
  score: number;
  label: "BULL" | "BEAR" | "NEUTRAL";
  /** Signed momentum −100…100. */
  momentum: number;
}

export interface KuriskoMarketContext {
  sessionVwap: number;
  ema50: number;
  ema200: number;
  aboveVwap: boolean;
  aboveEma50: boolean;
  aboveEma200: boolean;
  stoch6010: number;
  stoch6010Depth: number;
}

export interface KuriskoSymbolLevels {
  symbol: string;
  qrAlias: string;
  todayHi: number;
  todayLo: number;
  pivot: number;
  prevDay: number;
  prevHi: number;
  prevCls: number;
  prevLo: number;
  athFib: number | null;
}

export interface KuriskoLevelsResponse {
  scannedAt: number;
  symbols: KuriskoSymbolLevels[];
}

export interface KuriskoSnapshot {
  symbol: string;
  dataSource: "capital";
  timeframePairId: string;
  executionResolution: string;
  structureResolution: string;
  barTs: number;
  price: number;
  channelDirection: "up" | "down" | "none";
  channelValid: boolean;
  keyLevels: KuriskoKeyLevels | null;
  chartBars: KuriskoChartCandle[];
  vortexFlux: KuriskoVortexFlux;
  marketContext: KuriskoMarketContext;
  side: "long" | "short";
  stage: KuriskoK1Stage;
  passCount: number;
  totalSteps: number;
  quadExec: KuriskoQuadValues;
  quadStruct: KuriskoQuadValues;
  depthExec: KuriskoQuadDepths;
  depthStruct: KuriskoQuadDepths;
  steps: K1CriterionStep[];
  scannedAt: number;
}

export interface KuriskoFearGreed {
  value: number;
  classification: string;
  timestamp: number;
  source: string;
  prev?: number;
  weekAgo?: number;
  monthAgo?: number;
}

export interface KuriskoEconomicEvent {
  country: string;
  event: string;
  impact: "low" | "medium" | "high";
  time: number;
  actual?: string | null;
  estimate?: string | null;
  previous?: string | null;
}

export interface KuriskoEconomicCalendar {
  configured: boolean;
  events: KuriskoEconomicEvent[];
  note: string;
}

export interface KuriskoScanResult {
  scannedAt: number;
  symbols: string[];
  results: KuriskoSnapshot[];
  buyCount: number;
  sellCount: number;
  errors?: { symbol: string; error: string }[];
}

/** Server-cached scan feed returned by GET /api/kurisko/scan. */
export interface KuriskoScanFeed extends KuriskoScanResult {
  matrices: Record<string, KuriskoMatrix | null>;
  scanning: boolean;
  stale: boolean;
  message?: string;
  replayMode?: "live" | "snapshot";
  scanRunId?: string;
}

export interface KuriskoMatrixRow {
  timeframe: "1m" | "3m" | "5m";
  side: "long" | "short";
  stage: KuriskoK1Stage;
  bias: "BULL" | "BEAR" | "NEUTRAL";
  quad: KuriskoQuadValues;
  depths: KuriskoQuadDepths;
  barTs: number;
  price: number;
}

export interface KuriskoMatrix {
  symbol: string;
  dataSource: "capital";
  rows: KuriskoMatrixRow[];
  scannedAt: number;
}

export interface KuriskoAlert {
  id: string;
  source: "k1" | "tradingview";
  symbol: string;
  timeframe: string;
  side: "long" | "short";
  action: "BUY" | "SELL";
  fromStage: KuriskoK1Stage;
  toStage: KuriskoK1Stage;
  message: string;
  quadSnippet: string;
  price: number;
  ts: number;
}

export interface KuriskoAlertsResponse {
  alerts: KuriskoAlert[];
  buyCount: number;
  sellCount: number;
}
