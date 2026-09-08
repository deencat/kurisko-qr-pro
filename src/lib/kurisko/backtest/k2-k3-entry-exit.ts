/**
 * K2 / K3 entry levels + bar exits (RAG stop/TP / STOCH_A / mandatory long exit).
 */
import {
  KURISKO_DEFAULT_STOP_BUFFER_PCT,
  KURISKO_STOCH_THRESH_OVERBOUGHT,
  KURISKO_STOCH_THRESH_OVERSOLD,
} from "../constants";
import { k3MandatoryLongExit } from "./k2-k3-helpers";

export type K2K3Side = "long" | "short";

export type K2K3ExitReason =
  | "stop"
  | "tp"
  | "stoch_a"
  | "embed_lost"
  | "mandatory_long_exit"
  | "time_stop";

export interface K2K3EntryLevels {
  side: K2K3Side;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
}

export interface K2K3BarOHLC {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface K2EntryParams {
  entryPrice: number;
  /** min(pullback_low, EMA_20). */
  pullbackLow: number;
  ema20: number;
  /** 3–5 pts OR 5m upper rail. */
  targetPrice: number;
  stopBufferPct?: number;
}

/** K2 long: SL = min(pullback_low, EMA_20) − buffer; TP = upper rail / pts. */
export function buildK2EntryLevels(params: K2EntryParams): K2K3EntryLevels | null {
  const buf = params.stopBufferPct ?? KURISKO_DEFAULT_STOP_BUFFER_PCT;
  const entry = params.entryPrice;
  if (!(entry > 0) || !(params.targetPrice > entry)) return null;
  const anchor = Math.min(params.pullbackLow, params.ema20);
  const stop = anchor * (1 - buf);
  if (!(stop < entry)) return null;
  return { side: "long", entryPrice: entry, stopPrice: stop, targetPrice: params.targetPrice };
}

export interface K3EntryParams {
  entryPrice: number;
  bounceHigh: number;
  /** 5m lower rail or other TP. */
  targetPrice: number;
  stopBufferPct?: number;
}

/** K3 short: SL = bounce_high + buffer; TP = 5m lower rail. */
export function buildK3EntryLevels(params: K3EntryParams): K2K3EntryLevels | null {
  const buf = params.stopBufferPct ?? KURISKO_DEFAULT_STOP_BUFFER_PCT;
  const entry = params.entryPrice;
  if (!(entry > 0) || !(params.targetPrice < entry)) return null;
  const stop = params.bounceHigh * (1 + buf);
  if (!(stop > entry)) return null;
  return { side: "short", entryPrice: entry, stopPrice: stop, targetPrice: params.targetPrice };
}

export interface K2ExitOpts {
  timeStopBars?: number;
  /** When STOCH_D(5m) loses embed (drops below 80). */
  embedBullLost?: boolean;
}

export interface K3ExitOpts {
  timeStopBars?: number;
  /** K3 macro still active — drives mandatory long exit overlay. */
  k3MacroActive?: boolean;
}

export type K2K3ExitCheck =
  | { exit: true; reason: K2K3ExitReason; price: number }
  | { exit: false };

/**
 * K2 long exits: stop → TP → STOCH_A ≥ 80 → embed lost → time.
 */
export function checkK2ExitOnBar(
  pos: Pick<K2K3EntryLevels, "side" | "stopPrice" | "targetPrice"> & { entryBar: number },
  barIndex: number,
  bar: K2K3BarOHLC,
  stochA: number,
  stochAPrev: number,
  opts: K2ExitOpts = {}
): K2K3ExitCheck {
  if (pos.side !== "long") return { exit: false };
  const timeStopBars = opts.timeStopBars ?? 20;
  const ob = KURISKO_STOCH_THRESH_OVERBOUGHT;

  if (bar.l <= pos.stopPrice) return { exit: true, reason: "stop", price: pos.stopPrice };
  if (bar.h >= pos.targetPrice) return { exit: true, reason: "tp", price: pos.targetPrice };
  if (stochAPrev < ob && stochA >= ob) return { exit: true, reason: "stoch_a", price: bar.c };
  if (opts.embedBullLost) return { exit: true, reason: "embed_lost", price: bar.c };
  if (barIndex - pos.entryBar >= timeStopBars) {
    return { exit: true, reason: "time_stop", price: bar.c };
  }
  return { exit: false };
}

/**
 * K3 short exits: stop → TP (lower rail) → STOCH_A < 20 → time.
 * Also exposes mandatory_long_exit when evaluating a long held under K3 macro.
 */
export function checkK3ExitOnBar(
  pos: Pick<K2K3EntryLevels, "side" | "stopPrice" | "targetPrice"> & { entryBar: number },
  barIndex: number,
  bar: K2K3BarOHLC,
  stochA: number,
  stochAPrev: number,
  opts: K3ExitOpts = {}
): K2K3ExitCheck {
  const timeStopBars = opts.timeStopBars ?? 20;
  const os = KURISKO_STOCH_THRESH_OVERSOLD;
  const macro = opts.k3MacroActive ?? false;

  if (pos.side === "long") {
    if (k3MandatoryLongExit(stochA, macro)) {
      return { exit: true, reason: "mandatory_long_exit", price: bar.c };
    }
    return { exit: false };
  }

  if (bar.h >= pos.stopPrice) return { exit: true, reason: "stop", price: pos.stopPrice };
  if (bar.l <= pos.targetPrice) return { exit: true, reason: "tp", price: pos.targetPrice };
  if (stochAPrev > os && stochA <= os) return { exit: true, reason: "stoch_a", price: bar.c };
  if (barIndex - pos.entryBar >= timeStopBars) {
    return { exit: true, reason: "time_stop", price: bar.c };
  }
  return { exit: false };
}
