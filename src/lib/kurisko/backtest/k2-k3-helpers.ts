/**
 * Pure K2/K3 pattern helpers (RAG + video: embedded 60,10 + 9,3 pullback/flag).
 * Unit-testable without Capital or full dual-TF wiring.
 */
import type { LighterCandle } from "@/lib/lighter/client";
import {
  KURISKO_DEFAULT_STOP_BUFFER_PCT,
  KURISKO_STOCH_PARAMS,
  KURISKO_STOCH_THRESH_OVERBOUGHT,
  KURISKO_STOCH_THRESH_OVERSOLD,
} from "../constants";
import type { ChannelLines } from "../indicators/channel-geometry";
import {
  embeddedBear,
  embeddedBull,
  stochHooksUp,
  type QuadStochStack,
} from "../indicators/stochastic-quad";

/** RAG K2 entry: STOCH_A ≤ 22 before hook. */
export const K2_STOCH_A_ENTRY_MAX = 22;
/** RAG K3 sell-strength: STOCH_A crosses 78–80. */
export const K3_STOCH_A_SELL_MIN = 78;
/** Soft “toward 20” for flag pullback (not full quad OS). */
export const K2_PULLBACK_STOCH_A_MAX = 35;
/** Soft “toward 80” surge for K3_E4 before hard cross. */
export const K3_SURGE_STOCH_A_MIN = 70;

export function emaRising(ema: number[], i: number, lookback = 2): boolean {
  if (i < lookback) return false;
  const cur = ema[i] ?? 0;
  const prev = ema[i - lookback] ?? 0;
  return cur > prev;
}

/** K2_E1 alt: price > structure EMA_20 and EMA rising. */
export function strongUpLegStruct(
  price: number,
  ema20Struct: number,
  ema20Series: number[],
  structIdx: number
): boolean {
  return price > ema20Struct && emaRising(ema20Series, structIdx);
}

/** K3_E1 alt: price < structure EMA_200 (structural weakness). */
export function belowStructEma200(price: number, ema200Struct: number): boolean {
  return ema200Struct > 0 && price < ema200Struct;
}

/**
 * K2_E3 flagpole: ≥2 consecutive green 1m bars with closes above EMA_20
 * (steep rally off the 20).
 */
export function flagpoleOffEma20(
  candles: LighterCandle[],
  ema20: number[],
  i: number,
  lookback = 8
): { ok: boolean; greenBars: number; detail: string } {
  if (i < 1) return { ok: false, greenBars: 0, detail: "Need prior bars for flagpole" };
  let greenRun = 0;
  let bestRun = 0;
  const start = Math.max(1, i - lookback);
  for (let j = start; j <= i; j++) {
    const c = candles[j]!;
    const ema = ema20[j] ?? c.c;
    const green = c.c > c.o && c.c > ema;
    if (green) {
      greenRun++;
      bestRun = Math.max(bestRun, greenRun);
    } else {
      greenRun = 0;
    }
  }
  const ok = bestRun >= 2;
  return {
    ok,
    greenBars: bestRun,
    detail: ok
      ? `Flagpole: ${bestRun} consecutive green closes above EMA_20 in last ${lookback + 1} bars`
      : `No ≥2 green-above-EMA_20 run (best=${bestRun}) in last ${lookback + 1} bars`,
  };
}

/** Price touching / holding 1m EMA_20 within buffer (pullback or bounce). */
export function nearEma20(
  candle: LighterCandle,
  ema20: number,
  touchPct = KURISKO_DEFAULT_STOP_BUFFER_PCT
): boolean {
  if (!(ema20 > 0)) return false;
  const band = ema20 * touchPct;
  // Low tags the 20 or body straddles it
  return candle.l <= ema20 + band && candle.h >= ema20 - band;
}

/**
 * K2_E4: all four 1m stochs dipped (A toward 20) within lookback while still
 * recovering — “9,3 pullback flag” inside embedded 60,10 bull.
 */
export function quadDipToward20(
  stack: QuadStochStack,
  end: number,
  lookback = 8,
  aMax = K2_PULLBACK_STOCH_A_MAX
): { ok: boolean; detail: string } {
  const start = Math.max(0, end - lookback + 1);
  for (let i = end; i >= start; i--) {
    const a = stack.A[i] ?? 50;
    const allDip = KURISKO_STOCH_PARAMS.every(({ key }) => {
      const v = stack[key][i] ?? 50;
      if (key === "A") return v <= aMax;
      // Others must also ease (not pinned OB)
      return v < KURISKO_STOCH_THRESH_OVERBOUGHT;
    });
    if (allDip && a <= aMax) {
      return {
        ok: true,
        detail: `Quad dip at bar −${end - i}: A=${a.toFixed(1)} (≤${aMax}) · B=${(stack.B[i] ?? 0).toFixed(1)} · C=${(stack.C[i] ?? 0).toFixed(1)} · D=${(stack.D[i] ?? 0).toFixed(1)}`,
      };
    }
  }
  const aNow = stack.A[end] ?? 50;
  return {
    ok: false,
    detail: `No quad dip toward 20 in last ${lookback} bars — STOCH_A now ${aNow.toFixed(1)}`,
  };
}

/** Price still above / inside 5m channel (no breakdown) for K2 continuation. */
export function aboveOrInsideLowerRail(
  candle: LighterCandle,
  channel: ChannelLines,
  bufferPct = KURISKO_DEFAULT_STOP_BUFFER_PCT
): boolean {
  if (!channel.valid) return true; // when only up-leg path used, skip rail break
  const lower = channel.lowerAt(candle.t);
  if (!(lower > 0)) return true;
  return candle.l >= lower * (1 - bufferPct);
}

/** K2 entry trigger: A ≤ 22 and hooks up (reuse stochHooksUp + level). */
export function k2EntryHook(stack: QuadStochStack, i: number): boolean {
  if (!stochHooksUp(stack, i)) return false;
  const prev = stack.A[i - 1] ?? 100;
  // Hook must originate from ≤22 (RAG) — allow prev ≤22 or cur recovering through 22
  return prev <= K2_STOCH_A_ENTRY_MAX || (stack.A[i] ?? 100) <= K2_STOCH_A_ENTRY_MAX + 5;
}

/** Pullback low holds EMA_20 (RAG: low ≥ EMA_20 × (1 − 0.0005)). */
export function pullbackHoldsEma20(candle: LighterCandle, ema20: number): boolean {
  if (!(ema20 > 0)) return false;
  return candle.l >= ema20 * (1 - KURISKO_DEFAULT_STOP_BUFFER_PCT);
}

/**
 * K3_E3 dead-cat bounce: recent bounce toward upper rail or mid-channel,
 * optionally with brief 1m OS on fast stoch.
 */
export function deadCatBounceToResistance(
  candles: LighterCandle[],
  stack: QuadStochStack,
  channel: ChannelLines,
  i: number,
  lookback = 10,
  touchPct = 0.001
): { ok: boolean; detail: string } {
  const c = candles[i]!;
  const upper = channel.valid ? channel.upperAt(c.t) : 0;
  const mid = channel.valid ? channel.midAt(c.t) : 0;
  const start = Math.max(1, i - lookback);

  let bounced = false;
  for (let j = start; j <= i; j++) {
    const bar = candles[j]!;
    const prev = candles[j - 1]!;
    if (bar.c > prev.c && bar.c > bar.o) {
      bounced = true;
      break;
    }
  }

  const nearUpper =
    upper > 0 && Math.abs(Math.max(c.h, c.c) - upper) / c.c <= touchPct * 2;
  const nearMid = mid > 0 && Math.abs(c.c - mid) / c.c <= touchPct * 3;
  const briefOs = (stack.A[i] ?? 50) < KURISKO_STOCH_THRESH_OVERSOLD ||
    KURISKO_STOCH_PARAMS.some(({ key }) => {
      const idx = Math.max(0, i - 3);
      for (let j = idx; j <= i; j++) {
        if ((stack[key][j] ?? 50) < KURISKO_STOCH_THRESH_OVERSOLD) return true;
      }
      return false;
    });

  const ok = bounced && (nearUpper || nearMid || !channel.valid);
  return {
    ok,
    detail: ok
      ? `Dead-cat bounce${nearUpper ? " @ upper rail" : nearMid ? " @ mid" : ""}${briefOs ? " (brief 1m OS)" : ""}`
      : `No bounce to upper/mid — bounce=${bounced} nearUpper=${nearUpper} nearMid=${nearMid}`,
  };
}

/** K3_E4: STOCH_A surges toward 80 (rising into sell-strength zone). */
export function stochSurgeToward80(stack: QuadStochStack, i: number): boolean {
  if (i < 1) return false;
  const prev = stack.A[i - 1] ?? 0;
  const cur = stack.A[i] ?? 0;
  return cur > prev && cur >= K3_SURGE_STOCH_A_MIN;
}

/** Hard short trigger: A crosses 78–80 from below. */
export function k3SellStrengthCross(stack: QuadStochStack, i: number): boolean {
  if (i < 1) return false;
  const prev = stack.A[i - 1] ?? 0;
  const cur = stack.A[i] ?? 0;
  return prev < K3_STOCH_A_SELL_MIN && cur >= K3_STOCH_A_SELL_MIN;
}

/** Price below 1m EMA_20 and EMA_50 (K3 short filter). */
export function belowExecEma20And50(
  price: number,
  ema20: number,
  ema50: number
): boolean {
  return price < ema20 && price < ema50;
}

export function structureEmbeddedBull(
  stackStruct: QuadStochStack,
  idxStruct: number,
  embedBars: number
): boolean {
  return idxStruct >= 0 && embeddedBull(stackStruct, idxStruct, embedBars);
}

export function structureEmbeddedBear(
  stackStruct: QuadStochStack,
  idxStruct: number,
  embedBars: number
): boolean {
  return idxStruct >= 0 && embeddedBear(stackStruct, idxStruct, embedBars);
}

/** K3 macro: mandatory long scalp exit when A ≥ 80. */
export function k3MandatoryLongExit(stochA: number, k3MacroActive: boolean): boolean {
  return k3MacroActive && stochA >= KURISKO_STOCH_THRESH_OVERBOUGHT;
}
