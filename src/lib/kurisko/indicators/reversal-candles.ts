import type { LighterCandle } from "@/lib/lighter/client";
import { candleRange, isGreen, isRed } from "@/lib/aziz/backtest/engine-common";

export type KuriskoReversalPatternId =
  | "hammer"
  | "bullish_engulfing"
  | "doji"
  | "piercing_line"
  | "tweezer_bottom"
  | "shooting_star"
  | "bearish_engulfing"
  | "dark_cloud"
  | "evening_star"
  | "tweezer_top";

export interface ReversalPatternHit {
  id: KuriskoReversalPatternId;
  label: string;
}

const BODY_MAX = 0.35;
const WICK_MIN = 0.55;
const DOJI_BODY_MAX = 0.12;

function bodySize(c: LighterCandle): number {
  return Math.abs(c.c - c.o);
}

function upperWick(c: LighterCandle): number {
  return c.h - Math.max(c.o, c.c);
}

function lowerWick(c: LighterCandle): number {
  return Math.min(c.o, c.c) - c.l;
}

function isHammer(c: LighterCandle): boolean {
  const rng = candleRange(c);
  if (rng <= 0) return false;
  return lowerWick(c) / rng >= WICK_MIN && bodySize(c) / rng <= BODY_MAX;
}

function isShootingStar(c: LighterCandle): boolean {
  const rng = candleRange(c);
  if (rng <= 0) return false;
  return upperWick(c) / rng >= WICK_MIN && bodySize(c) / rng <= BODY_MAX;
}

function isDoji(c: LighterCandle): boolean {
  const rng = candleRange(c);
  if (rng <= 0) return false;
  return bodySize(c) / rng <= DOJI_BODY_MAX;
}

function isBullEngulf(candles: LighterCandle[], i: number): boolean {
  if (i < 1) return false;
  const c = candles[i]!;
  const p = candles[i - 1]!;
  return isGreen(c) && isRed(p) && c.c > p.o && c.o < p.c;
}

function isBearEngulf(candles: LighterCandle[], i: number): boolean {
  if (i < 1) return false;
  const c = candles[i]!;
  const p = candles[i - 1]!;
  return isRed(c) && isGreen(p) && c.c < p.o && c.o > p.c;
}

/** Piercing: red then green; green opens below prior low, closes above prior midpoint. */
function isPiercingLine(candles: LighterCandle[], i: number): boolean {
  if (i < 1) return false;
  const c = candles[i]!;
  const p = candles[i - 1]!;
  if (!isGreen(c) || !isRed(p)) return false;
  const mid = (p.o + p.c) / 2;
  return c.o < p.l && c.c > mid && c.c < p.o;
}

/** Dark cloud: green then red; red opens above prior high, closes below prior midpoint. */
function isDarkCloud(candles: LighterCandle[], i: number): boolean {
  if (i < 1) return false;
  const c = candles[i]!;
  const p = candles[i - 1]!;
  if (!isRed(c) || !isGreen(p)) return false;
  const mid = (p.o + p.c) / 2;
  return c.o > p.h && c.c < mid && c.c > p.o;
}

function isTweezerBottom(candles: LighterCandle[], i: number, tolerancePct = 0.0008): boolean {
  if (i < 1) return false;
  const c = candles[i]!;
  const p = candles[i - 1]!;
  const tol = Math.max(c.l, p.l) * tolerancePct;
  return Math.abs(c.l - p.l) <= tol && isGreen(c);
}

function isTweezerTop(candles: LighterCandle[], i: number, tolerancePct = 0.0008): boolean {
  if (i < 1) return false;
  const c = candles[i]!;
  const p = candles[i - 1]!;
  const tol = Math.max(c.h, p.h) * tolerancePct;
  return Math.abs(c.h - p.h) <= tol && isRed(c);
}

/** Morning star (simplified): red, small body, green closing into first body. */
function isMorningStar(candles: LighterCandle[], i: number): boolean {
  if (i < 2) return false;
  const a = candles[i - 2]!;
  const b = candles[i - 1]!;
  const c = candles[i]!;
  if (!isRed(a) || !isGreen(c)) return false;
  const rngB = candleRange(b);
  if (rngB <= 0 || bodySize(b) / rngB > 0.4) return false;
  return c.c > (a.o + a.c) / 2;
}

function isEveningStar(candles: LighterCandle[], i: number): boolean {
  if (i < 2) return false;
  const a = candles[i - 2]!;
  const b = candles[i - 1]!;
  const c = candles[i]!;
  if (!isGreen(a) || !isRed(c)) return false;
  const rngB = candleRange(b);
  if (rngB <= 0 || bodySize(b) / rngB > 0.4) return false;
  return c.c < (a.o + a.c) / 2;
}

const BULL_PATTERNS: { id: KuriskoReversalPatternId; label: string; test: (candles: LighterCandle[], i: number) => boolean }[] = [
  { id: "hammer", label: "Hammer", test: (c, i) => isHammer(c[i]!) },
  { id: "bullish_engulfing", label: "Bullish engulfing", test: (c, i) => isBullEngulf(c, i) },
  { id: "doji", label: "Doji", test: (c, i) => isDoji(c[i]!) },
  { id: "piercing_line", label: "Piercing line", test: (c, i) => isPiercingLine(c, i) },
  { id: "tweezer_bottom", label: "Tweezer bottom", test: (c, i) => isTweezerBottom(c, i) },
];

const BEAR_PATTERNS: { id: KuriskoReversalPatternId; label: string; test: (candles: LighterCandle[], i: number) => boolean }[] = [
  { id: "shooting_star", label: "Shooting star", test: (c, i) => isShootingStar(c[i]!) },
  { id: "bearish_engulfing", label: "Bearish engulfing", test: (c, i) => isBearEngulf(c, i) },
  { id: "doji", label: "Doji", test: (c, i) => isDoji(c[i]!) },
  { id: "dark_cloud", label: "Dark cloud cover", test: (c, i) => isDarkCloud(c, i) },
  { id: "tweezer_top", label: "Tweezer top", test: (c, i) => isTweezerTop(c, i) },
];

export function detectBullishReversal(candles: LighterCandle[], i: number): ReversalPatternHit | null {
  for (const p of BULL_PATTERNS) {
    if (p.test(candles, i)) return { id: p.id, label: p.label };
  }
  if (isMorningStar(candles, i)) return { id: "hammer", label: "Morning star" };
  return null;
}

export function detectBearishReversal(candles: LighterCandle[], i: number): ReversalPatternHit | null {
  for (const p of BEAR_PATTERNS) {
    if (p.test(candles, i)) return { id: p.id, label: p.label };
  }
  if (isEveningStar(candles, i)) return { id: "shooting_star", label: "Evening star" };
  return null;
}

/** Any of Kurisko's 5 reversal families on trigger bar or prior bar. */
export function bullishReversalRecent(candles: LighterCandle[], i: number, lookback = 2): ReversalPatternHit | null {
  const from = Math.max(0, i - lookback);
  for (let j = i; j >= from; j--) {
    const hit = detectBullishReversal(candles, j);
    if (hit) return hit;
  }
  return null;
}

export function bearishReversalRecent(candles: LighterCandle[], i: number, lookback = 2): ReversalPatternHit | null {
  const from = Math.max(0, i - lookback);
  for (let j = i; j >= from; j--) {
    const hit = detectBearishReversal(candles, j);
    if (hit) return hit;
  }
  return null;
}

export const KURISKO_BULL_REVERSAL_LABELS = BULL_PATTERNS.map((p) => p.label).join(" · ");
export const KURISKO_BEAR_REVERSAL_LABELS = BEAR_PATTERNS.map((p) => p.label).join(" · ");
