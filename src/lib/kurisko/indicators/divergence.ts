import type { LighterCandle } from "@/lib/lighter/client";
import type { QuadStochStack } from "./stochastic-quad";
import type { ChannelLines } from "./channel-geometry";
import { bodyHigh, bodyLow } from "./channel-geometry";

function nearRail(price: number, rail: number, tolerancePct: number): boolean {
  if (!Number.isFinite(price) || !Number.isFinite(rail)) return false;
  return Math.abs(price - rail) / Math.max(Math.abs(price), 1e-9) <= tolerancePct;
}

/** Bars where price interacted with the channel rail (body preferred, wick fallback). */
function findRailInteractionBars(
  candles: LighterCandle[],
  channel: ChannelLines,
  side: "lower" | "upper",
  end: number,
  lookback: number,
  tolerancePct: number
): number[] {
  const start = Math.max(0, end - lookback);
  const hits: number[] = [];
  for (let j = start; j <= end; j++) {
    const c = candles[j]!;
    const rail = side === "lower" ? channel.lowerAt(c.t) : channel.upperAt(c.t);
    const body = side === "lower" ? bodyLow(c) : bodyHigh(c);
    const wick = side === "lower" ? c.l : c.h;
    if (nearRail(body, rail, tolerancePct) || nearRail(wick, rail, tolerancePct)) {
      hits.push(j);
    }
  }
  return hits;
}

/** Collapse adjacent rail touches — keep the extreme price at the rail. */
function collapseRailTouches(
  candles: LighterCandle[],
  hits: number[],
  side: "lower" | "upper",
  minSeparation: number
): number[] {
  if (hits.length === 0) return [];
  const spaced: number[] = [hits[0]!];
  for (let k = 1; k < hits.length; k++) {
    const j = hits[k]!;
    const last = spaced[spaced.length - 1]!;
    if (j - last < minSeparation) {
      const lastP = side === "lower" ? bodyLow(candles[last]!) : bodyHigh(candles[last]!);
      const curP = side === "lower" ? bodyLow(candles[j]!) : bodyHigh(candles[j]!);
      const replace =
        side === "lower" ? curP <= lastP : curP >= lastP;
      if (replace) spaced[spaced.length - 1] = j;
    } else {
      spaced.push(j);
    }
  }
  return spaced;
}

export function findSwingLows(candles: LighterCandle[], end: number, lookback: number): number[] {
  const lows: number[] = [];
  const start = Math.max(1, end - lookback);
  for (let i = start; i <= end; i++) {
    if (candles[i]!.l <= candles[i - 1]!.l && candles[i]!.l <= candles[i + 1]?.l) {
      lows.push(i);
    }
  }
  return lows;
}

export function findSwingHighs(candles: LighterCandle[], end: number, lookback: number): number[] {
  const highs: number[] = [];
  const start = Math.max(1, end - lookback);
  for (let i = start; i <= end; i++) {
    if (candles[i]!.h >= candles[i - 1]!.h && candles[i]!.h >= candles[i + 1]?.h) {
      highs.push(i);
    }
  }
  return highs;
}

/**
 * Kurisko K1: two lows at/near lower rail — lower (or equal) price low, higher STOCH_A low (≥20).
 * Pattern can complete 1–10 bars before the hook trigger bar (Stage 3 → trigger).
 */
export function bullishDivergenceAtRail(
  candles: LighterCandle[],
  stack1m: QuadStochStack,
  channel: ChannelLines,
  i: number,
  lookback = 20,
  tolerancePct = 0.001
): boolean {
  if (!channel.valid || channel.direction !== "down") return false;

  const hits = collapseRailTouches(
    candles,
    findRailInteractionBars(candles, channel, "lower", i, lookback, tolerancePct),
    "lower",
    3
  );
  if (hits.length < 2) return false;

  const i1 = hits[hits.length - 2]!;
  const i2 = hits[hits.length - 1]!;
  if (i - i2 > 10) return false;

  const p1 = bodyLow(candles[i1]!);
  const p2 = bodyLow(candles[i2]!);
  const priceLowerOrEqual = p2 <= p1 * (1 + tolerancePct);
  const s1 = stack1m.A[i1] ?? 0;
  const s2 = stack1m.A[i2] ?? 0;
  return priceLowerOrEqual && s2 > s1 && s2 >= 20;
}

/** Mirror: two highs at upper rail — higher price high, lower STOCH_A high (≤80). */
export function bearishDivergenceAtRail(
  candles: LighterCandle[],
  stack1m: QuadStochStack,
  channel: ChannelLines,
  i: number,
  lookback = 20,
  tolerancePct = 0.001
): boolean {
  if (!channel.valid || channel.direction !== "up") return false;

  const hits = collapseRailTouches(
    candles,
    findRailInteractionBars(candles, channel, "upper", i, lookback, tolerancePct),
    "upper",
    3
  );
  if (hits.length < 2) return false;

  const first = hits[hits.length - 2]!;
  const second = hits[hits.length - 1]!;
  if (i - second > 10) return false;

  const p1 = bodyHigh(candles[first]!);
  const p2 = bodyHigh(candles[second]!);
  const priceHigherOrEqual = p2 >= p1 * (1 - tolerancePct);
  const s1 = stack1m.A[first] ?? 100;
  const s2 = stack1m.A[second] ?? 100;
  return priceHigherOrEqual && s2 < s1 && s2 <= 80;
}

/** Divergence completed within `window` bars of trigger (Stage 3 → hook on later bar). */
export function bullishDivergenceRecent(
  candles: LighterCandle[],
  stack1m: QuadStochStack,
  channel: ChannelLines,
  i: number,
  lookback = 20,
  tolerancePct = 0.001,
  window = 10
): boolean {
  const from = Math.max(0, i - window);
  for (let j = i; j >= from; j--) {
    if (bullishDivergenceAtRail(candles, stack1m, channel, j, lookback, tolerancePct)) return true;
  }
  return false;
}

export function bearishDivergenceRecent(
  candles: LighterCandle[],
  stack1m: QuadStochStack,
  channel: ChannelLines,
  i: number,
  lookback = 20,
  tolerancePct = 0.001,
  window = 10
): boolean {
  const from = Math.max(0, i - window);
  for (let j = i; j >= from; j--) {
    if (bearishDivergenceAtRail(candles, stack1m, channel, j, lookback, tolerancePct)) return true;
  }
  return false;
}
