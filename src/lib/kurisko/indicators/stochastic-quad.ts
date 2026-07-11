import type { LighterCandle } from "@/lib/lighter/client";
import { sma } from "@/lib/aziz/backtest/indicators";
import { KURISKO_STOCH_PARAMS, KURISKO_STOCH_THRESH_OVERBOUGHT, KURISKO_STOCH_THRESH_OVERSOLD } from "../constants";

export type StochKey = "A" | "B" | "C" | "D";

/** %K = raw stochastic; %D = smoothed signal line (used for quad gates + display). */
export interface StochKdSeries {
  k: number[];
  d: number[];
}

export type QuadStochKdStack = Record<StochKey, StochKdSeries>;

/** D-line only — same values used by backtest / K1 gates. */
export type QuadStochStack = Record<StochKey, number[]>;

function rawStochK(candles: LighterCandle[], i: number, period: number): number {
  if (i < period - 1) return 50;
  let lowest = Infinity;
  let highest = -Infinity;
  for (let j = i - period + 1; j <= i; j++) {
    lowest = Math.min(lowest, candles[j].l);
    highest = Math.max(highest, candles[j].h);
  }
  const range = highest - lowest;
  if (range <= 0) return 50;
  return (100 * (candles[i].c - lowest)) / range;
}

function smoothSeries(values: number[], smooth: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    out.push(sma(values, smooth, i));
  }
  return out;
}

export function buildQuadStochKdStack(candles: LighterCandle[]): QuadStochKdStack {
  const stack = {} as QuadStochKdStack;
  for (const { key, period, smooth } of KURISKO_STOCH_PARAMS) {
    const k = candles.map((_, i) => rawStochK(candles, i, period));
    stack[key] = { k, d: smoothSeries(k, smooth) };
  }
  return stack;
}

/** Quad gates use %D (smoothed) — matches Kurisko template signal lines. */
export function buildQuadStochStack(candles: LighterCandle[]): QuadStochStack {
  const kd = buildQuadStochKdStack(candles);
  return {
    A: kd.A.d,
    B: kd.B.d,
    C: kd.C.d,
    D: kd.D.d,
  };
}

export function quadOversold(stack: QuadStochStack, i: number): boolean {
  return KURISKO_STOCH_PARAMS.every(
    ({ key }) => (stack[key][i] ?? 50) < KURISKO_STOCH_THRESH_OVERSOLD
  );
}

export function quadOverbought(stack: QuadStochStack, i: number): boolean {
  return KURISKO_STOCH_PARAMS.every(
    ({ key }) => (stack[key][i] ?? 50) > KURISKO_STOCH_THRESH_OVERBOUGHT
  );
}

export function embeddedBull(stack: QuadStochStack, i: number, embedBars: number): boolean {
  if (i < embedBars - 1) return false;
  for (let k = 0; k < embedBars; k++) {
    if ((stack.D[i - k] ?? 0) < KURISKO_STOCH_THRESH_OVERBOUGHT) return false;
  }
  return true;
}

export function embeddedBear(stack: QuadStochStack, i: number, embedBars: number): boolean {
  if (i < embedBars - 1) return false;
  for (let k = 0; k < embedBars; k++) {
    if ((stack.D[i - k] ?? 100) > KURISKO_STOCH_THRESH_OVERSOLD) return false;
  }
  return true;
}

export function quadOversoldWithin(stack: QuadStochStack, end: number, lookback: number): boolean {
  const start = Math.max(0, end - lookback + 1);
  for (let i = end; i >= start; i--) {
    if (quadOversold(stack, i)) return true;
  }
  return false;
}

export function quadOverboughtWithin(stack: QuadStochStack, end: number, lookback: number): boolean {
  const start = Math.max(0, end - lookback + 1);
  for (let i = end; i >= start; i--) {
    if (quadOverbought(stack, i)) return true;
  }
  return false;
}

export function stochHooksUp(stack: QuadStochStack, i: number): boolean {
  if (i < 1) return false;
  const prev = stack.A[i - 1] ?? 0;
  const cur = stack.A[i] ?? 0;
  // Stage 2 bounce: hook from oversold zone (RAG: ≤25; allow modest recovery to 30)
  return cur > prev && prev <= 30;
}

export function stochHooksDown(stack: QuadStochStack, i: number): boolean {
  if (i < 1) return false;
  const prev = stack.A[i - 1] ?? 100;
  const cur = stack.A[i] ?? 100;
  return cur < prev && prev >= 70;
}
