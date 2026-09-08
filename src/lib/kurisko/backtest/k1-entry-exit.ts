/**
 * K1 entry level construction + bar-by-bar exit checks (RAG / video).
 * Pure helpers — unit-testable without Capital or dual-TF context.
 * K2/K3 engines can reuse the same exit modes when ready.
 *
 * Exit modes (see docs/K1_BACKTEST.md):
 * - mvp:        stop → TP mid → STOCH_A cross 80/20 → time
 * - fast93:     stop → STOCH_A into strength (cross OR already OB/OS) → TP mid → time
 * - tp2_rail:   stop → opposite-rail TP2 (skip mid; no partials) → STOCH_A → time
 * - fast93_tp2: stop → STOCH_A → opposite-rail TP2 (skip mid) → time
 *
 * Note: without scale-out partials, mid always sits between entry and the opposite
 * rail, so a mid-then-rail priority never realizes TP2. Rail modes therefore
 * *replace* mid with the opposite rail as the hard TP.
 */
import {
  KURISKO_DEFAULT_STOP_BUFFER_PCT,
  KURISKO_STOCH_THRESH_OVERBOUGHT,
  KURISKO_STOCH_THRESH_OVERSOLD,
} from "../constants";
import type { K1EntryLevels, K1ExitMode, K1ExitReason, K1OpenPosition, K1Side } from "./k1-types";

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
  /** Exit mode — default mvp (prior ~1y baseline). */
  exitMode?: K1ExitMode;
  /**
   * Live (or locked) opposite-rail price for optional TP2.
   * Long → channel upper; short → channel lower.
   */
  oppositeRailPrice?: number;
  /**
   * Soft mid exit into 9,3 (video: sometimes only to 50 in weak markets).
   * When true, long exits on cross up through stochMid; short on cross down.
   * Only applies in fast93 / fast93_tp2.
   */
  stochMidExit?: boolean;
  /** Soft mid threshold (default 50). */
  stochMid?: number;
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

export const K1_EXIT_MODES: readonly K1ExitMode[] = [
  "mvp",
  "fast93",
  "tp2_rail",
  "fast93_tp2",
] as const;

export function parseK1ExitMode(raw: string | undefined): K1ExitMode {
  const v = (raw ?? "mvp").trim().toLowerCase();
  if ((K1_EXIT_MODES as readonly string[]).includes(v)) return v as K1ExitMode;
  throw new Error(`Unknown --exit-mode ${raw}. Use: ${K1_EXIT_MODES.join(" | ")}`);
}

/** Long: stop under swing low; short: stop above swing high. Target = channel mid (TP1). */
export function buildK1EntryLevels(params: {
  side: K1Side;
  entryPrice: number;
  swingLow: number;
  swingHigh: number;
  channelMid: number;
  /** Opposite rail at entry (optional TP2 lock). */
  oppositeRail?: number;
  stopBufferPct?: number;
}): K1EntryLevels | null {
  const buf = params.stopBufferPct ?? KURISKO_DEFAULT_STOP_BUFFER_PCT;
  const entry = params.entryPrice;
  if (!(entry > 0) || !(params.channelMid > 0)) return null;

  if (params.side === "long") {
    const stop = params.swingLow * (1 - buf);
    if (!(stop < entry) || !(params.channelMid > entry)) return null;
    const tp2 =
      params.oppositeRail != null && params.oppositeRail > params.channelMid
        ? params.oppositeRail
        : undefined;
    return {
      side: "long",
      entryPrice: entry,
      stopPrice: stop,
      targetPrice: params.channelMid,
      tp2Price: tp2,
    };
  }

  const stop = params.swingHigh * (1 + buf);
  if (!(stop > entry) || !(params.channelMid < entry)) return null;
  const tp2 =
    params.oppositeRail != null && params.oppositeRail < params.channelMid
      ? params.oppositeRail
      : undefined;
  return {
    side: "short",
    entryPrice: entry,
    stopPrice: stop,
    targetPrice: params.channelMid,
    tp2Price: tp2,
  };
}

function wantsFast93(mode: K1ExitMode): boolean {
  return mode === "fast93" || mode === "fast93_tp2";
}

function wantsTp2(mode: K1ExitMode): boolean {
  return mode === "tp2_rail" || mode === "fast93_tp2";
}

/** Long: sell into strength when 9,3 rotates up through OB (or already OB). */
function longStochExit(
  stochA: number,
  stochAPrev: number,
  ob: number,
  opts: { midExit: boolean; mid: number }
): boolean {
  if (stochAPrev < ob && stochA >= ob) return true;
  // Fast 9,3 fidelity: already OB → mandatory exit (K3 long-scalp rule / video)
  if (stochA >= ob) return true;
  if (opts.midExit && stochAPrev < opts.mid && stochA >= opts.mid) return true;
  return false;
}

function shortStochExit(
  stochA: number,
  stochAPrev: number,
  os: number,
  opts: { midExit: boolean; mid: number }
): boolean {
  if (stochAPrev > os && stochA <= os) return true;
  if (stochA <= os) return true;
  if (opts.midExit && stochAPrev > opts.mid && stochA <= opts.mid) return true;
  return false;
}

function checkStop(
  pos: Pick<K1OpenPosition, "side" | "stopPrice">,
  bar: K1BarOHLC
): K1ExitHit | null {
  if (pos.side === "long" && bar.l <= pos.stopPrice) {
    return { exit: true, reason: "stop", price: pos.stopPrice };
  }
  if (pos.side === "short" && bar.h >= pos.stopPrice) {
    return { exit: true, reason: "stop", price: pos.stopPrice };
  }
  return null;
}

function checkTpMid(
  pos: Pick<K1OpenPosition, "side" | "targetPrice">,
  bar: K1BarOHLC
): K1ExitHit | null {
  if (pos.side === "long" && bar.h >= pos.targetPrice) {
    return { exit: true, reason: "tp_mid", price: pos.targetPrice };
  }
  if (pos.side === "short" && bar.l <= pos.targetPrice) {
    return { exit: true, reason: "tp_mid", price: pos.targetPrice };
  }
  return null;
}

function checkTpRail(
  pos: Pick<K1OpenPosition, "side" | "tp2Price">,
  bar: K1BarOHLC,
  liveRail: number | undefined
): K1ExitHit | null {
  const rail = liveRail ?? pos.tp2Price;
  if (rail == null || !(rail > 0)) return null;
  if (pos.side === "long" && bar.h >= rail) {
    return { exit: true, reason: "tp_rail", price: rail };
  }
  if (pos.side === "short" && bar.l <= rail) {
    return { exit: true, reason: "tp_rail", price: rail };
  }
  return null;
}

function checkStoch(
  pos: Pick<K1OpenPosition, "side">,
  bar: K1BarOHLC,
  stochA: number,
  stochAPrev: number,
  ob: number,
  os: number,
  mode: K1ExitMode,
  opts: { midExit: boolean; mid: number }
): K1ExitHit | null {
  const midOpts = {
    midExit: opts.midExit && wantsFast93(mode),
    mid: opts.mid,
  };
  if (pos.side === "long") {
    const hit = wantsFast93(mode)
      ? longStochExit(stochA, stochAPrev, ob, midOpts)
      : stochAPrev < ob && stochA >= ob;
    if (hit) return { exit: true, reason: "stoch_a", price: bar.c };
  } else {
    const hit = wantsFast93(mode)
      ? shortStochExit(stochA, stochAPrev, os, midOpts)
      : stochAPrev > os && stochA <= os;
    if (hit) return { exit: true, reason: "stoch_a", price: bar.c };
  }
  return null;
}

/**
 * Intrabar exit priority depends on exitMode.
 * Stop always first. Same-bar fill uses level price for stop/TP.
 */
export function checkK1ExitOnBar(
  pos: Pick<K1OpenPosition, "side" | "entryBar" | "stopPrice" | "targetPrice" | "tp2Price">,
  barIndex: number,
  bar: K1BarOHLC,
  stochA: number,
  stochAPrev: number,
  opts: K1ExitCheckOpts = {}
): K1ExitCheck {
  const timeStopBars = opts.timeStopBars ?? 20;
  const ob = opts.stochOb ?? KURISKO_STOCH_THRESH_OVERBOUGHT;
  const os = opts.stochOs ?? KURISKO_STOCH_THRESH_OVERSOLD;
  const mode = opts.exitMode ?? "mvp";
  const held = barIndex - pos.entryBar;
  const midExit = opts.stochMidExit ?? false;
  const mid = opts.stochMid ?? 50;

  const stop = checkStop(pos, bar);
  if (stop) return stop;

  const railOrMidFallback = (): K1ExitHit | null => {
    const railHit = checkTpRail(pos, bar, opts.oppositeRailPrice);
    if (railHit) return railHit;
    const hasRail =
      (opts.oppositeRailPrice != null && opts.oppositeRailPrice > 0) ||
      (pos.tp2Price != null && pos.tp2Price > 0);
    // Only fall back to mid when no opposite rail is configured.
    return hasRail ? null : checkTpMid(pos, bar);
  };

  // Without partials: rail modes replace mid with opposite-rail TP (RAG TP2).
  // Fall back to mid only when live/locked rail is unavailable.
  const order: Array<() => K1ExitHit | null> = wantsFast93(mode)
    ? wantsTp2(mode)
      ? [
          () => checkStoch(pos, bar, stochA, stochAPrev, ob, os, mode, { midExit, mid }),
          railOrMidFallback,
        ]
      : [
          () => checkStoch(pos, bar, stochA, stochAPrev, ob, os, mode, { midExit, mid }),
          () => checkTpMid(pos, bar),
        ]
    : wantsTp2(mode)
      ? [
          railOrMidFallback,
          () => checkStoch(pos, bar, stochA, stochAPrev, ob, os, mode, { midExit, mid }),
        ]
      : [
          () => checkTpMid(pos, bar),
          () => checkStoch(pos, bar, stochA, stochAPrev, ob, os, mode, { midExit, mid }),
        ];

  for (const step of order) {
    const hit = step();
    if (hit) return hit;
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
