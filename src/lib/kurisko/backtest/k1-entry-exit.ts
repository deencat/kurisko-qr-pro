/**
 * K1 entry level construction + bar-by-bar exit checks (RAG: stop, TP mid, STOCH_A 80/20, time stop).
 * Pure helpers — unit-testable without Capital or dual-TF context.
 */
import {
  KURISKO_DEFAULT_STOP_BUFFER_PCT,
  KURISKO_STOCH_THRESH_OVERBOUGHT,
  KURISKO_STOCH_THRESH_OVERSOLD,
} from "../constants";
import type { K1EntryLevels, K1ExitReason, K1OpenPosition, K1Side } from "./k1-types";

export interface K1BarOHLC {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface K1ExitCheckOpts {
  /** Max 1m bars in trade before time stop (RAG: 15–20). Default 20. */
  timeStopBars?: number;
  stochOb?: number;
  stochOs?: number;
}

export interface K1ExitHit {
  exit: true;
  reason: K1ExitReason;
  price: number;
}

export interface K1ExitHold {
  exit: false;
}

export type K1ExitCheck = K1ExitHit | K1ExitHold;

/** Long: stop under swing low; short: stop above swing high. Target = channel mid. */
export function buildK1EntryLevels(params: {
  side: K1Side;
  entryPrice: number;
  swingLow: number;
  swingHigh: number;
  channelMid: number;
  stopBufferPct?: number;
}): K1EntryLevels | null {
  const buf = params.stopBufferPct ?? KURISKO_DEFAULT_STOP_BUFFER_PCT;
  const entry = params.entryPrice;
  if (!(entry > 0) || !(params.channelMid > 0)) return null;

  if (params.side === "long") {
    const stop = params.swingLow * (1 - buf);
    if (!(stop < entry) || !(params.channelMid > entry)) return null;
    return { side: "long", entryPrice: entry, stopPrice: stop, targetPrice: params.channelMid };
  }

  const stop = params.swingHigh * (1 + buf);
  if (!(stop > entry) || !(params.channelMid < entry)) return null;
  return { side: "short", entryPrice: entry, stopPrice: stop, targetPrice: params.channelMid };
}

/**
 * Intrabar exit priority: stop → TP (channel mid) → STOCH_A cross → time stop.
 * Stop/TP use optimistic fill at level when both could print in the same bar.
 */
export function checkK1ExitOnBar(
  pos: Pick<K1OpenPosition, "side" | "entryBar" | "stopPrice" | "targetPrice">,
  barIndex: number,
  bar: K1BarOHLC,
  stochA: number,
  stochAPrev: number,
  opts: K1ExitCheckOpts = {}
): K1ExitCheck {
  const timeStopBars = opts.timeStopBars ?? 20;
  const ob = opts.stochOb ?? KURISKO_STOCH_THRESH_OVERBOUGHT;
  const os = opts.stochOs ?? KURISKO_STOCH_THRESH_OVERSOLD;
  const held = barIndex - pos.entryBar;

  if (pos.side === "long") {
    if (bar.l <= pos.stopPrice) {
      return { exit: true, reason: "stop", price: pos.stopPrice };
    }
    if (bar.h >= pos.targetPrice) {
      return { exit: true, reason: "tp_mid", price: pos.targetPrice };
    }
    if (stochAPrev < ob && stochA >= ob) {
      return { exit: true, reason: "stoch_a", price: bar.c };
    }
  } else {
    if (bar.h >= pos.stopPrice) {
      return { exit: true, reason: "stop", price: pos.stopPrice };
    }
    if (bar.l <= pos.targetPrice) {
      return { exit: true, reason: "tp_mid", price: pos.targetPrice };
    }
    if (stochAPrev > os && stochA <= os) {
      return { exit: true, reason: "stoch_a", price: bar.c };
    }
  }

  if (held >= timeStopBars) {
    return { exit: true, reason: "time_stop", price: bar.c };
  }

  return { exit: false };
}

/** Round-trip cost as absolute PnL drag (spread + slip each side). */
export function applyRoundTripCost(params: {
  side: K1Side;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  /** Fraction of price per side (e.g. 0.00005 = 0.5 bps). */
  costBpsPerSide?: number;
}): { grossPnl: number; costs: number; netPnl: number } {
  const bps = params.costBpsPerSide ?? 0.00005;
  const signed =
    params.side === "long"
      ? (params.exitPrice - params.entryPrice) * params.qty
      : (params.entryPrice - params.exitPrice) * params.qty;
  const midNotional = ((params.entryPrice + params.exitPrice) / 2) * params.qty;
  const costs = midNotional * bps * 2;
  return { grossPnl: signed, costs, netPnl: signed - costs };
}
