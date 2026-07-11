import type { LighterCandle } from "@/lib/lighter/client";

export function trueRange(c: LighterCandle, prevClose: number): number {
  return Math.max(c.h - c.l, Math.abs(c.h - prevClose), Math.abs(c.l - prevClose));
}

export function sma(values: number[], period: number, i: number): number {
  if (i < period - 1) return values[i] ?? 0;
  let sum = 0;
  for (let j = i - period + 1; j <= i; j++) sum += values[j] ?? 0;
  return sum / period;
}

/** Pine ta.pivotlow — confirmed `right` bars after the pivot bar. */
export function pivotLow(candles: LighterCandle[], i: number, left: number, right: number): number | null {
  const pivotIdx = i - right;
  if (pivotIdx < left || pivotIdx < 0) return null;
  const pivotVal = candles[pivotIdx].l;
  for (let j = pivotIdx - left; j <= pivotIdx + right; j++) {
    if (j < 0 || j >= candles.length) return null;
    if (candles[j].l < pivotVal - 1e-9) return null;
  }
  return pivotVal;
}

export function pivotHigh(candles: LighterCandle[], i: number, left: number, right: number): number | null {
  const pivotIdx = i - right;
  if (pivotIdx < left || pivotIdx < 0) return null;
  const pivotVal = candles[pivotIdx].h;
  for (let j = pivotIdx - left; j <= pivotIdx + right; j++) {
    if (j < 0 || j >= candles.length) return null;
    if (candles[j].h > pivotVal + 1e-9) return null;
  }
  return pivotVal;
}

export function lowestSince(candles: LighterCandle[], from: number, to: number): number {
  let min = Infinity;
  for (let j = from; j <= to; j++) min = Math.min(min, candles[j].l);
  return min;
}

export function highestSince(candles: LighterCandle[], from: number, to: number): number {
  let max = -Infinity;
  for (let j = from; j <= to; j++) max = Math.max(max, candles[j].h);
  return max;
}
