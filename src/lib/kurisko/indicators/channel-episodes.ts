import "server-only";

import type { LighterCandle } from "@/lib/lighter/client";
import {
  bodyHigh,
  bodyLow,
  buildChannelFromPivots,
  collectStructurePivots,
  type ChannelLines,
  type ChannelPivot123,
} from "./channel-geometry";
import type { KuriskoChannelEpisodeDraw } from "../backtest/chart-window-types";

export type { KuriskoChannelEpisodeDraw };

const BASE_STRUCTURE_PERIOD_MS = 5 * 60 * 1000;
const BASE_PIVOT_LEFT_RIGHT = 2;
const BASE_MIN_BARS_BETWEEN_PIVOTS = 3;
const BASE_MAX_AGE_BARS = 60;

/** Body close beyond rail by this fraction of channel width = real break (not a flush). */
const HARD_BREAK_WIDTH_MULT = 0.25;
/** Allow this many consecutive outside bars before invalidating (retest window). */
const FLUSH_GRACE_BARS = 2;

export interface ChannelEpisode {
  kind: "down" | "up";
  pivots: ChannelPivot123;
  /** Bar time when P3 confirmed and rails lock (forward extension starts here). */
  tConfirm: number;
  tStart: number;
  tEnd: number;
  /** Still active at series end (not hard-broken). */
  active: boolean;
  upperAt: (t: number) => number;
  lowerAt: (t: number) => number;
  slopeDeg: number;
}

interface ChannelEpisodeOptions {
  pivotLeft?: number;
  pivotRight?: number;
  minBarsBetweenPivots?: number;
  maxAgeBars?: number;
}

function timeframeScaledOptions(periodMs: number, opts: ChannelEpisodeOptions): Required<ChannelEpisodeOptions> {
  const scale = Math.max(1, Math.round(BASE_STRUCTURE_PERIOD_MS / periodMs));
  return {
    pivotLeft: opts.pivotLeft ?? BASE_PIVOT_LEFT_RIGHT * scale,
    pivotRight: opts.pivotRight ?? BASE_PIVOT_LEFT_RIGHT * scale,
    minBarsBetweenPivots: opts.minBarsBetweenPivots ?? BASE_MIN_BARS_BETWEEN_PIVOTS * scale,
    maxAgeBars: opts.maxAgeBars ?? BASE_MAX_AGE_BARS * scale,
  };
}

function recentPivotLimitForPeriod(periodMs: number): number {
  const scale = Math.max(1, Math.round(BASE_STRUCTURE_PERIOD_MS / periodMs));
  return Math.max(50, Math.min(100, 80 / Math.sqrt(scale)));
}

function pivotKey(p: ChannelPivot123): string {
  return `${p.kind}|${p.a.t}|${p.b.t}|${p.c.t}`;
}

function structBarIndex(candlesStruct: LighterCandle[], ts: number): number {
  for (let i = 0; i < candlesStruct.length; i++) {
    if (candlesStruct[i]!.t === ts) return i;
  }
  for (let i = candlesStruct.length - 1; i >= 0; i--) {
    if (candlesStruct[i]!.t <= ts) return i;
  }
  return -1;
}

function channelFitsCandle(channel: ChannelLines, candle: LighterCandle): boolean {
  const upper = channel.upperAt(candle.t);
  const lower = channel.lowerAt(candle.t);
  const hiRail = Math.max(upper, lower);
  const loRail = Math.min(upper, lower);
  const width = hiRail - loRail;
  const mid = (hiRail + loRail) / 2;
  if (!Number.isFinite(width) || !Number.isFinite(mid) || width <= 0 || mid <= 0) return false;

  const widthPct = width / mid;
  if (widthPct < 0.0005 || widthPct > 0.04) return false;

  // Near current price action (body-based, not wick extremes).
  const tolerance = width * 0.75;
  const bh = bodyHigh(candle);
  const bl = bodyLow(candle);
  return bh >= loRail - tolerance && bl <= hiRail + tolerance;
}

/**
 * Canceling candle (Kurisko channel video):
 * spike breaks the rail, next candle fully regains the space → ignore the spike.
 */
export function isCancelingCandlePair(prev: LighterCandle, curr: LighterCandle): boolean {
  const prevBody = Math.abs(prev.c - prev.o);
  const currBody = Math.abs(curr.c - curr.o);
  if (prevBody <= 0 || currBody <= 0) return false;

  // Prev spiked down, curr buys it all back (or more).
  const downSpike =
    prev.c < prev.o &&
    curr.c > curr.o &&
    bodyLow(curr) <= bodyLow(prev) + prevBody * 0.15 &&
    bodyHigh(curr) >= bodyHigh(prev) - prevBody * 0.15;

  // Prev spiked up, curr sells it all back.
  const upSpike =
    prev.c > prev.o &&
    curr.c < curr.o &&
    bodyHigh(curr) >= bodyHigh(prev) - prevBody * 0.15 &&
    bodyLow(curr) <= bodyLow(prev) + prevBody * 0.15;

  return downSpike || upSpike;
}

/**
 * Keep original 1-2-3 through flush/retest.
 * Only hard-break when body closes clearly outside for several bars (not a canceling spike).
 */
function episodeHardBroken(
  ep: ChannelEpisode,
  candles: LighterCandle[],
  end: number
): boolean {
  const candle = candles[end]!;
  const upper = ep.upperAt(candle.t);
  const lower = ep.lowerAt(candle.t);
  const hiRail = Math.max(upper, lower);
  const loRail = Math.min(upper, lower);
  const width = hiRail - loRail;
  if (!Number.isFinite(hiRail) || !Number.isFinite(loRail) || width <= 0) return false;

  // Canceling pair: ignore this bar for break purposes.
  if (end > 0 && isCancelingCandlePair(candles[end - 1]!, candle)) {
    return false;
  }
  // Also ignore if *this* bar was the spike that the next bar cancels (checked on next bar).
  // When evaluating current, if previous was canceling with current, already handled above.

  const bodyC = candle.c;
  const bh = bodyHigh(candle);
  const bl = bodyLow(candle);
  const buffer = width * HARD_BREAK_WIDTH_MULT;
  const outsideUp = bodyC > hiRail + buffer || bh > hiRail + buffer;
  const outsideDown = bodyC < loRail - buffer || bl < loRail - buffer;
  if (!outsideUp && !outsideDown) return false;

  // Require sustained outside bars (flush grace) — retests keep the original channel.
  let outsideCount = 0;
  const from = Math.max(0, end - FLUSH_GRACE_BARS + 1);
  for (let i = from; i <= end; i++) {
    const c = candles[i]!;
    if (i > 0 && isCancelingCandlePair(candles[i - 1]!, c)) continue;
    const u = ep.upperAt(c.t);
    const l = ep.lowerAt(c.t);
    const hi = Math.max(u, l);
    const lo = Math.min(u, l);
    const buf = (hi - lo) * HARD_BREAK_WIDTH_MULT;
    const cBh = bodyHigh(c);
    const cBl = bodyLow(c);
    if (c.c > hi + buf || c.c < lo - buf || cBh > hi + buf || cBl < lo - buf) outsideCount++;
  }
  return outsideCount >= FLUSH_GRACE_BARS;
}

/**
 * Walk-forward 1-2-3 channels on structure TF.
 * Locks on confirmed P3; keeps original rails through flush/retest until hard break or max age.
 */
export function buildChannelEpisodes(
  candlesStruct: LighterCandle[],
  periodMs: number,
  opts: ChannelEpisodeOptions = {}
): ChannelEpisode[] {
  if (candlesStruct.length < 30) return [];

  const scaled = timeframeScaledOptions(periodMs, opts);
  const allPivots = collectStructurePivots(candlesStruct, scaled.pivotLeft, scaled.pivotRight);
  const maxAgeMs = scaled.maxAgeBars * periodMs;
  const seriesEnd = candlesStruct[candlesStruct.length - 1]!.t + periodMs;
  const episodes: ChannelEpisode[] = [];
  let lockedIdx = -1;
  let lockedKey = "";
  let pivotPrefix = 0;

  const tryLockChannel = (end: number, tConfirm: number): boolean => {
    const ch = buildChannelFromPivots(
      allPivots,
      pivotPrefix,
      scaled.minBarsBetweenPivots,
      recentPivotLimitForPeriod(periodMs)
    );
    if (!ch.valid || !ch.pivots) return false;
    if (!channelFitsCandle(ch, candlesStruct[end]!)) return false;

    const p3Idx = structBarIndex(candlesStruct, ch.pivots.c.t);
    if (p3Idx < 0 || end < p3Idx + scaled.pivotRight) return false;

    const key = pivotKey(ch.pivots);
    if (key === lockedKey) return false;

    const newEp: ChannelEpisode = {
      kind: ch.pivots.kind,
      pivots: ch.pivots,
      tConfirm,
      tStart: ch.pivots.a.t,
      tEnd: tConfirm,
      active: true,
      upperAt: ch.upperAt,
      lowerAt: ch.lowerAt,
      slopeDeg: ch.slopeDeg ?? 0,
    };
    lockedIdx = episodes.length;
    lockedKey = key;
    episodes.push(newEp);
    return true;
  };

  for (let end = 30; end < candlesStruct.length; end++) {
    while (pivotPrefix < allPivots.length && allPivots[pivotPrefix]!.i <= end) {
      pivotPrefix++;
    }

    const tConfirm = candlesStruct[end]!.t;

    if (lockedIdx >= 0) {
      const activeEp = episodes[lockedIdx]!;
      const age = tConfirm - activeEp.pivots.c.t;
      if (age > maxAgeMs) {
        activeEp.tEnd = tConfirm;
        activeEp.active = false;
        lockedIdx = -1;
        lockedKey = "";
        tryLockChannel(end, tConfirm);
        continue;
      }
      if (episodeHardBroken(activeEp, candlesStruct, end)) {
        activeEp.tEnd = tConfirm;
        activeEp.active = false;
        lockedIdx = -1;
        lockedKey = "";
        tryLockChannel(end, tConfirm);
        continue;
      }
      // Video: extend locked rails forward bar-by-bar until break (continuous projection).
      activeEp.tEnd = tConfirm;
      continue;
    }

    tryLockChannel(end, tConfirm);
  }

  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i]!;
    const nextStart = episodes[i + 1]?.tConfirm ?? seriesEnd;
    const maxEnd = ep.pivots.c.t + maxAgeMs;
    if (i < episodes.length - 1) {
      ep.tEnd = Math.min(ep.tEnd, nextStart);
      ep.active = false;
    } else {
      ep.tEnd = Math.min(ep.tEnd, maxEnd, seriesEnd);
    }
  }

  return episodes.filter((ep) => ep.tEnd > ep.tConfirm);
}

/** Video-style chain: sequential non-overlapping segments (no fan of stale rails). */
function selectContinuousChain(episodes: ChannelEpisode[], maxSegments = 12): ChannelEpisode[] {
  if (episodes.length === 0) return [];
  const sorted = [...episodes].sort((a, b) => a.tConfirm - b.tConfirm);
  const chain: ChannelEpisode[] = [];
  let lastEnd = -Infinity;

  for (const ep of sorted) {
    if (ep.tEnd <= ep.tConfirm) continue;
    if (chain.length === 0 || ep.tConfirm >= lastEnd) {
      chain.push(ep);
      lastEnd = ep.tEnd;
    }
  }

  return chain.slice(-maxSegments);
}

function pickHighlightEpisodeIndex(
  episodes: ChannelEpisode[],
  matchTs?: number,
  matchPrice?: number
): number {
  if (matchTs == null || episodes.length === 0) return -1;

  let bestIdx = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i]!;
    if (matchTs < ep.tConfirm || matchTs > ep.tEnd) continue;

    const upper = ep.upperAt(matchTs);
    const lower = ep.lowerAt(matchTs);
    const hiRail = Math.max(upper, lower);
    const loRail = Math.min(upper, lower);
    const width = Math.max(hiRail - loRail, 1e-9);
    const mid = (hiRail + loRail) / 2;

    let score = 50;
    if (matchPrice != null) {
      const tol = width * 0.6;
      if (matchPrice >= loRail - tol && matchPrice <= hiRail + tol) {
        score += 200;
        score -= (Math.abs(matchPrice - mid) / width) * 40;
      } else {
        // Active in time but price left the channel — don't highlight stale rails.
        score -= 300;
      }
    }
    score -= Math.abs(matchTs - ep.tConfirm) / (60 * 60 * 1000);

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0 && bestScore > 0) return bestIdx;

  // Fallback: most recent episode that was active near match time.
  for (let i = episodes.length - 1; i >= 0; i--) {
    const ep = episodes[i]!;
    if (matchTs >= ep.tConfirm && matchTs <= ep.tEnd + 60 * 60 * 1000) return i;
  }

  return episodes.length - 1;
}

export function episodesForChart(
  episodes: ChannelEpisode[],
  chartTStart: number,
  chartTEnd: number,
  matchTs?: number,
  maxEpisodes = 20,
  matchPrice?: number
): KuriskoChannelEpisodeDraw[] {
  const chain = selectContinuousChain(episodes, maxEpisodes);
  const highlightIdxInChain = (() => {
    const globalIdx = pickHighlightEpisodeIndex(episodes, matchTs, matchPrice);
    if (globalIdx < 0) return chain.length - 1;
    const ep = episodes[globalIdx]!;
    const inChain = chain.findIndex((c) => c.tConfirm === ep.tConfirm && pivotKey(c.pivots) === pivotKey(ep.pivots));
    return inChain >= 0 ? inChain : chain.length - 1;
  })();

  const visible = chain
    .map((ep, idx) => {
      const isLast = idx === chain.length - 1;
      const isHighlight = idx === highlightIdxInChain;
      const tConfirm = ep.tConfirm;
      // Past segments: forward extension only (prevents fan from ancient P1).
      // Highlighted segment: show full P1→P3 formation + extension.
      const tStart = isHighlight
        ? Math.max(ep.tStart, chartTStart)
        : Math.max(tConfirm, chartTStart);
      const tEnd =
        isLast && ep.active ? chartTEnd : Math.min(ep.tEnd, chartTEnd);
      if (tEnd <= tStart) return null;

      return {
        kind: ep.kind,
        tConfirm,
        tStart,
        tEnd,
        slopeDeg: ep.slopeDeg,
        upperStart: ep.upperAt(tStart),
        upperEnd: ep.upperAt(tEnd),
        lowerStart: ep.lowerAt(tStart),
        lowerEnd: ep.lowerAt(tEnd),
        p1: { t: ep.pivots.a.t, price: ep.pivots.a.price },
        p2: { t: ep.pivots.b.t, price: ep.pivots.b.price },
        p3: { t: ep.pivots.c.t, price: ep.pivots.c.price },
        highlight: isHighlight,
      } satisfies KuriskoChannelEpisodeDraw;
    })
    .filter((x): x is KuriskoChannelEpisodeDraw => x != null);

  return visible;
}

export function channelEpisodeAt(episodes: ChannelEpisode[], ts: number): ChannelEpisode | null {
  for (let i = episodes.length - 1; i >= 0; i--) {
    const ep = episodes[i]!;
    if (ts >= ep.tConfirm && ts <= ep.tEnd) return ep;
  }
  return null;
}
