import type { LighterCandle } from "@/lib/lighter/client";

const MS_5M = 5 * 60 * 1000;

/** Kurisko channel video: ~90% of rails use candle body, not wick noise. */
export function bodyHigh(c: LighterCandle): number {
  return Math.max(c.o, c.c);
}

export function bodyLow(c: LighterCandle): number {
  return Math.min(c.o, c.c);
}

/** Body swing low confirmed at pivotIdx = i - right. */
function pivotBodyLow(candles: LighterCandle[], i: number, left: number, right: number): number | null {
  const pivotIdx = i - right;
  if (pivotIdx < left || pivotIdx < 0) return null;
  const pivotVal = bodyLow(candles[pivotIdx]!);
  for (let j = pivotIdx - left; j <= pivotIdx + right; j++) {
    if (j < 0 || j >= candles.length) return null;
    if (bodyLow(candles[j]!) < pivotVal - 1e-9) return null;
  }
  return pivotVal;
}

/** Body swing high confirmed at pivotIdx = i - right. */
function pivotBodyHigh(candles: LighterCandle[], i: number, left: number, right: number): number | null {
  const pivotIdx = i - right;
  if (pivotIdx < left || pivotIdx < 0) return null;
  const pivotVal = bodyHigh(candles[pivotIdx]!);
  for (let j = pivotIdx - left; j <= pivotIdx + right; j++) {
    if (j < 0 || j >= candles.length) return null;
    if (bodyHigh(candles[j]!) > pivotVal + 1e-9) return null;
  }
  return pivotVal;
}

export function aggregateCandles(candles: LighterCandle[], periodMs: number): LighterCandle[] {
  const buckets = new Map<number, LighterCandle>();
  for (const c of candles) {
    const bucket = Math.floor(c.t / periodMs) * periodMs;
    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, { t: bucket, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v });
    } else {
      existing.h = Math.max(existing.h, c.h);
      existing.l = Math.min(existing.l, c.l);
      existing.c = c.c;
      existing.v += c.v;
    }
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

export function mapToStructureIndex(
  candlesStruct: LighterCandle[],
  tsExec: number,
  structurePeriodMs: number
): number {
  const bucket = Math.floor(tsExec / structurePeriodMs) * structurePeriodMs;
  for (let i = candlesStruct.length - 1; i >= 0; i--) {
    if (candlesStruct[i]!.t <= bucket) return i;
  }
  return -1;
}

export function aggregateCandlesTo5m(candles1m: LighterCandle[]): LighterCandle[] {
  return aggregateCandles(candles1m, MS_5M);
}

export function map1mTo5mIndex(candles5m: LighterCandle[], ts1m: number): number {
  return mapToStructureIndex(candles5m, ts1m, MS_5M);
}

export interface ChannelPivot123 {
  kind: "down" | "up";
  /** P1 / rail anchor A */
  a: { t: number; price: number };
  /** P2 / parallel anchor (opposite rail) */
  b: { t: number; price: number };
  /** P3 / second rail point */
  c: { t: number; price: number };
}

export interface ChannelLines {
  valid: boolean;
  direction: "down" | "up" | "none";
  upperAt: (ts: number) => number;
  lowerAt: (ts: number) => number;
  midAt: (ts: number) => number;
  /** 1-2-3 pivots used (Kurisko: clone upper rail, drop parallel to P2). */
  pivots?: ChannelPivot123;
  slopeDeg?: number;
}

interface PivotPoint {
  i: number;
  t: number;
  price: number;
  kind: "high" | "low";
}

interface ChannelCandidate {
  seq: ChannelPivot123;
  p3Index: number;
  anchorIndex: number;
  spanBars: number;
  score: number;
}

export function collectStructurePivots(candles: LighterCandle[], left = 2, right = 2): PivotPoint[] {
  const pivots: PivotPoint[] = [];
  for (let i = left + right; i < candles.length; i++) {
    const lo = pivotBodyLow(candles, i, left, right);
    if (lo != null) {
      pivots.push({ i: i - right, t: candles[i - right]!.t, price: lo, kind: "low" });
    }
    const hi = pivotBodyHigh(candles, i, left, right);
    if (hi != null) {
      pivots.push({ i: i - right, t: candles[i - right]!.t, price: hi, kind: "high" });
    }
  }
  return pivots.sort((a, b) => a.i - b.i);
}

function lineThrough(t1: number, p1: number, t2: number, p2: number): (t: number) => number {
  const dt = t2 - t1;
  const slope = dt !== 0 ? (p2 - p1) / dt : 0;
  return (t: number) => p1 + slope * (t - t1);
}

/** Same slope as reference line, forced through anchor point (parallel clone). */
function parallelThrough(
  ref: (t: number) => number,
  refT1: number,
  refP1: number,
  refT2: number,
  anchorT: number,
  anchorPrice: number
): (t: number) => number {
  const dt = refT2 - refT1;
  const slope = dt !== 0 ? (ref(refT2) - refP1) / dt : 0;
  return (t: number) => anchorPrice + slope * (t - anchorT);
}

function slopeDeg(t1: number, p1: number, t2: number, p2: number): number {
  const hours = Math.abs(t2 - t1) / (60 * 60 * 1000);
  const mid = (Math.abs(p1) + Math.abs(p2)) / 2;
  if (hours === 0 || mid === 0) return 0;

  // Visual chart angles are scale-dependent. Normalize as percent move per hour
  // so the RAG's 15-40 degree slope gate works across GOLD/CFDs/crypto prices.
  const pctPerHour = ((p2 - p1) / mid) * 100 / hours;
  return (Math.atan(pctPerHour) * 180) / Math.PI;
}

/**
 * Descending 1-2-3: P1 swing high → P2 swing low → P3 lower high.
 * Upper rail through P1–P3; lower rail = parallel clone through P2 or optional P4 lower low.
 */
function findDescending123(pivots: PivotPoint[], minBarsBetweenPivots: number): ChannelCandidate | null {
  let best: ChannelCandidate | null = null;
  for (let i = pivots.length - 1; i >= 0; i--) {
    const p3 = pivots[i];
    if (p3.kind !== "high") continue;
    for (let j = i - 1; j >= 0; j--) {
      const p2 = pivots[j];
      if (p2.kind !== "low") continue;
      if (p2.i >= p3.i) continue;
      if (p3.i - p2.i < minBarsBetweenPivots) continue;
      for (let k = j - 1; k >= 0; k--) {
        const p1 = pivots[k];
        if (p1.kind !== "high") continue;
        if (p1.i >= p2.i) continue;
        if (p2.i - p1.i < minBarsBetweenPivots) continue;
        if (p3.i - p1.i > MAX_CHANNEL_SPAN_BARS) continue;
        if (p3.price >= p1.price) continue;
        if (p2.price >= p1.price) continue;

        const seq: ChannelPivot123 = {
          kind: "down",
          a: { t: p1.t, price: p1.price },
          b: { t: p2.t, price: p2.price },
          c: { t: p3.t, price: p3.price },
        };
        const candidate = scoreCandidate(seq, p3.i, p2.i, p3.i - p1.i);
        if (!best || candidate.score > best.score) best = candidate;
      }
    }
  }
  return best;
}

/** Ascending 1-2-3: P1 low → P2 high → P3 higher low; lower through P1–P3, upper parallel through P2. */
function findAscending123(pivots: PivotPoint[], minBarsBetweenPivots: number): ChannelCandidate | null {
  let best: ChannelCandidate | null = null;
  for (let i = pivots.length - 1; i >= 0; i--) {
    const p3 = pivots[i];
    if (p3.kind !== "low") continue;
    for (let j = i - 1; j >= 0; j--) {
      const p2 = pivots[j];
      if (p2.kind !== "high") continue;
      if (p2.i >= p3.i) continue;
      if (p3.i - p2.i < minBarsBetweenPivots) continue;
      for (let k = j - 1; k >= 0; k--) {
        const p1 = pivots[k];
        if (p1.kind !== "low") continue;
        if (p1.i >= p2.i) continue;
        if (p2.i - p1.i < minBarsBetweenPivots) continue;
        if (p3.i - p1.i > MAX_CHANNEL_SPAN_BARS) continue;
        if (p3.price <= p1.price) continue;
        if (p2.price <= p1.price) continue;

        const seq: ChannelPivot123 = {
          kind: "up",
          a: { t: p1.t, price: p1.price },
          b: { t: p2.t, price: p2.price },
          c: { t: p3.t, price: p3.price },
        };
        const candidate = scoreCandidate(seq, p3.i, p2.i, p3.i - p1.i);
        if (!best || candidate.score > best.score) best = candidate;
      }
    }
  }
  return best;
}

const MAX_CHANNEL_SPAN_BARS = 40;
const PREFERRED_CHANNEL_SPAN_BARS = 25;

function scoreCandidate(
  seq: ChannelPivot123,
  p3Index: number,
  anchorIndex: number,
  spanBars: number
): ChannelCandidate {
  const deg = Math.abs(slopeDeg(seq.a.t, seq.a.price, seq.c.t, seq.c.price));
  const slopePenalty = deg >= 20 && deg <= 30 ? 0 : Math.min(80, Math.abs(deg - 25) * 2);
  // Tight local 1-2-3 only — macro swings make flat "long lines" that never break.
  const spanPenalty =
    spanBars > MAX_CHANNEL_SPAN_BARS
      ? 500 + (spanBars - MAX_CHANNEL_SPAN_BARS) * 10
      : spanBars > PREFERRED_CHANNEL_SPAN_BARS
        ? (spanBars - PREFERRED_CHANNEL_SPAN_BARS) * 6
        : 0;
  const spanScore = Math.max(0, PREFERRED_CHANNEL_SPAN_BARS - spanBars) * 4;
  const recencyScore = p3Index * 3;
  return {
    seq,
    p3Index,
    anchorIndex,
    spanBars,
    score: recencyScore + spanScore - slopePenalty - spanPenalty,
  };
}

const none: ChannelLines = {
  valid: false,
  direction: "none",
  upperAt: () => 0,
  lowerAt: () => 0,
  midAt: () => 0,
};

function buildFrom123(seq: ChannelPivot123): ChannelLines {
  if (seq.kind === "down") {
    // Upper rail MUST pass through P1 and P3; lower rail MUST pass through P2 (parallel).
    const upperAt = lineThrough(seq.a.t, seq.a.price, seq.c.t, seq.c.price);
    const lowerAt = parallelThrough(upperAt, seq.a.t, seq.a.price, seq.c.t, seq.b.t, seq.b.price);
    // Sanity: reject if pivots are not on their rails (floating-point / degenerate).
    const eps = Math.max(1e-6, Math.abs(seq.a.price) * 1e-8);
    if (
      Math.abs(upperAt(seq.a.t) - seq.a.price) > eps ||
      Math.abs(upperAt(seq.c.t) - seq.c.price) > eps ||
      Math.abs(lowerAt(seq.b.t) - seq.b.price) > eps
    ) {
      return none;
    }
    return {
      valid: true,
      direction: "down",
      upperAt,
      lowerAt,
      midAt: (t) => (upperAt(t) + lowerAt(t)) / 2,
      pivots: seq,
      slopeDeg: slopeDeg(seq.a.t, seq.a.price, seq.c.t, seq.c.price),
    };
  }
  // Lower rail MUST pass through P1 and P3; upper rail MUST pass through P2 (parallel).
  const lowerAt = lineThrough(seq.a.t, seq.a.price, seq.c.t, seq.c.price);
  const upperAt = parallelThrough(lowerAt, seq.a.t, seq.a.price, seq.c.t, seq.b.t, seq.b.price);
  const eps = Math.max(1e-6, Math.abs(seq.a.price) * 1e-8);
  if (
    Math.abs(lowerAt(seq.a.t) - seq.a.price) > eps ||
    Math.abs(lowerAt(seq.c.t) - seq.c.price) > eps ||
    Math.abs(upperAt(seq.b.t) - seq.b.price) > eps
  ) {
    return none;
  }
  return {
    valid: true,
    direction: "up",
    upperAt,
    lowerAt,
    midAt: (t) => (upperAt(t) + lowerAt(t)) / 2,
    pivots: seq,
    slopeDeg: slopeDeg(seq.a.t, seq.a.price, seq.c.t, seq.c.price),
  };
}

/** Build 1-2-3 **parallel** channel from structure-timeframe candles (RAG Pillar 1). */
export function buildChannelFromStructure(candlesStruct: LighterCandle[]): ChannelLines {
  if (candlesStruct.length < 30) return none;
  return buildChannelFromPivots(collectStructurePivots(candlesStruct));
}

/** Same as buildChannelFromStructure but reuses a precomputed pivot prefix (faster walk-forward). */
export function buildChannelFromPivots(
  pivots: PivotPoint[],
  maxIndex = pivots.length,
  minBarsBetweenPivots = 3,
  recentPivotLimit = 80
): ChannelLines {
  const prefix = maxIndex >= pivots.length ? pivots : pivots.slice(0, maxIndex);
  const slice = prefix.length > recentPivotLimit ? prefix.slice(-recentPivotLimit) : prefix;
  if (slice.length < 6) return none;

  const down = findDescending123(slice, minBarsBetweenPivots);
  const up = findAscending123(slice, minBarsBetweenPivots);

  if (down && up) {
    return buildFrom123(down.score >= up.score ? down.seq : up.seq);
  }
  if (down) return buildFrom123(down.seq);
  if (up) return buildFrom123(up.seq);
  return none;
}

export function atLowerRail(price: number, channel: ChannelLines, ts: number, tolerancePct: number): boolean {
  if (!channel.valid || channel.direction !== "down") return false;
  const rail = channel.lowerAt(ts);
  return Math.abs(price - rail) / Math.max(price, 1e-9) <= tolerancePct;
}

export function atUpperRail(price: number, channel: ChannelLines, ts: number, tolerancePct: number): boolean {
  if (!channel.valid || channel.direction !== "up") return false;
  const rail = channel.upperAt(ts);
  return Math.abs(price - rail) / Math.max(price, 1e-9) <= tolerancePct;
}

/** Wick or body at rail — hook bars often bounce off rail (close above lower rail). */
export function atOrNearLowerRail(
  candle: LighterCandle,
  channel: ChannelLines,
  tolerancePct: number,
  slackMult = 1.5
): boolean {
  if (!channel.valid || channel.direction !== "down") return false;
  const tol = tolerancePct * slackMult;
  const rail = channel.lowerAt(candle.t);
  const body = bodyLow(candle);
  return (
    Math.abs(candle.l - rail) / Math.max(candle.l, 1e-9) <= tol ||
    Math.abs(body - rail) / Math.max(body, 1e-9) <= tol
  );
}

/** Trigger bar near rail OR a rail touch within last `lookback` bars (Kurisko Stage 2–3). */
export function lowerRailContextOk(
  candles: LighterCandle[],
  i: number,
  channel: ChannelLines,
  tolerancePct: number,
  lookback = 6
): boolean {
  if (atOrNearLowerRail(candles[i]!, channel, tolerancePct, 2)) return true;
  const from = Math.max(0, i - lookback);
  for (let j = from; j < i; j++) {
    if (atOrNearLowerRail(candles[j]!, channel, tolerancePct, 1.5)) return true;
  }
  return false;
}

export function atOrNearUpperRail(
  candle: LighterCandle,
  channel: ChannelLines,
  tolerancePct: number,
  slackMult = 1.5
): boolean {
  if (!channel.valid || channel.direction !== "up") return false;
  const tol = tolerancePct * slackMult;
  const rail = channel.upperAt(candle.t);
  const body = bodyHigh(candle);
  return (
    Math.abs(candle.h - rail) / Math.max(candle.h, 1e-9) <= tol ||
    Math.abs(body - rail) / Math.max(body, 1e-9) <= tol
  );
}

export function upperRailContextOk(
  candles: LighterCandle[],
  i: number,
  channel: ChannelLines,
  tolerancePct: number,
  lookback = 6
): boolean {
  if (atOrNearUpperRail(candles[i]!, channel, tolerancePct, 2)) return true;
  const from = Math.max(0, i - lookback);
  for (let j = from; j < i; j++) {
    if (atOrNearUpperRail(candles[j]!, channel, tolerancePct, 1.5)) return true;
  }
  return false;
}

export function channelValidDown(channel: ChannelLines): boolean {
  if (!channel.valid || channel.direction !== "down") return false;
  const deg = Math.abs(channel.slopeDeg ?? 0);
  return deg >= 15 && deg <= 40;
}

export function channelValidUp(channel: ChannelLines): boolean {
  if (!channel.valid || channel.direction !== "up") return false;
  const deg = Math.abs(channel.slopeDeg ?? 0);
  return deg >= 15 && deg <= 40;
}

/** @deprecated Use buildChannelFromStructure */
export const buildChannelFrom5m = buildChannelFromStructure;
