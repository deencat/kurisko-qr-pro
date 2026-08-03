import type { GusParams } from "../types";

export type GusPhase = "SCAN" | "PUSH" | "CONSOL" | "PARTIAL" | "FULL" | "FLAT" | "SKIP";

export type SkipReason =
  | "hard_filter"
  | "gap"
  | "crowded_pm"
  | "nano_rotation"
  | "no_locate"
  | "stop_risk"
  | "no_entry"
  | "vol_clock_block";

export interface GusEvent {
  t: number;
  type: string;
  detail?: Record<string, number | string | boolean | null>;
}

export interface FillLeg {
  t: number;
  side: "short" | "cover";
  shares: number;
  price: number;
  reason: string;
}

export interface Trade {
  symbol: string;
  entryTs: number;
  exitTs: number;
  avgEntry: number;
  avgExit: number;
  shares: number;
  pnl: number;
  riskDollars: number;
  rMultiple: number | null;
  exitReason: string;
  legs: FillLeg[];
}

export interface DayContext {
  symbol: string;
  dayKey: string;
  priorClose: number;
  rthOpen: number;
  pmLast: number;
  pmHigh: number;
  pmVolume: number;
  pmVolumeM: number;
  gapOpenPct: number;
  gapPmPct: number;
  gapPmHighPct: number;
  eDayVol: number;
  floatShares: number | null;
  mcapUsd: number | null;
  floatRotation: number | null;
  isBiotech: boolean;
  isEnergy: boolean;
  isChinaAdr: boolean;
  priceRef: number;
  sizeMult: number;
  skipReason: SkipReason | null;
  journal: GusEvent[];
}

export interface DayResult {
  symbol: string;
  dayKey: string;
  skipReason: SkipReason | null;
  trades: Trade[];
  events: GusEvent[];
  sizeMult: number;
  ctx: DayContext;
}

export interface BacktestResult {
  params: GusParams;
  equityStart: number;
  days: DayResult[];
  trades: Trade[];
  summary: BacktestSummary;
}

export interface BacktestSummary {
  days: number;
  tradedDays: number;
  skips: Record<string, number>;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  expectancy: number;
  avgR: number | null;
  maxDrawdown: number;
}

export interface SweepRow {
  family: string;
  overrides: Record<string, number | string | boolean | null>;
  summary: BacktestSummary;
}

export interface BacktestOptions {
  equity?: number;
  /** When set, only process these symbols. */
  symbols?: string[];
}
