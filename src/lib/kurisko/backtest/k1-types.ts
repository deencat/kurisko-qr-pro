import type { K1CriterionStep } from "./k1-diagnose";

export type K1Side = "long" | "short";

export type K1ExitReason = "stop" | "tp_mid" | "stoch_a" | "time_stop" | "eod_flat";

export interface K1EntryLevels {
  side: K1Side;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
}

export interface K1OpenPosition extends K1EntryLevels {
  entryBar: number;
  entryTs: number;
  qty: number;
  steps: K1CriterionStep[];
}

export interface K1Trade {
  id: number;
  side: K1Side;
  entryBar: number;
  exitBar: number;
  entryTs: number;
  exitTs: number;
  entryPrice: number;
  exitPrice: number;
  stopPrice: number;
  targetPrice: number;
  qty: number;
  grossPnl: number;
  costs: number;
  netPnl: number;
  exitReason: K1ExitReason;
  barsHeld: number;
}

export interface K1BacktestSummary {
  symbol: string;
  bars: number;
  signals: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  /** Gross profit / |gross loss|; null if no losses. */
  profitFactor: number | null;
  grossPnl: number;
  costs: number;
  netPnl: number;
  expectancy: number;
  maxDrawdown: number;
  byExitReason: Record<string, number>;
}

export interface K1BacktestResult {
  symbol: string;
  structurePeriodMs: number;
  summary: K1BacktestSummary;
  trades: K1Trade[];
  funnelSignals: number;
}
