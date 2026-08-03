import type { BacktestResult, Trade } from "../backtest/types";
import type { GusParams } from "../types";

export type PaperMode = "parity" | "forward";

export interface PaperOrder {
  symbol: string;
  t: number;
  side: "short" | "cover";
  shares: number;
  price: number;
  reason: string;
}

export interface PaperRunResult {
  mode: PaperMode;
  params: GusParams;
  equity: number;
  backtest: BacktestResult;
  orders: PaperOrder[];
  trades: Trade[];
  runId: number | null;
  parity: ParityReport | null;
}

export interface ParityMismatch {
  path: string;
  expected: string | number;
  actual: string | number;
}

export interface ParityReport {
  ok: boolean;
  mismatches: ParityMismatch[];
}
