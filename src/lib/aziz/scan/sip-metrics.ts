import type { LighterCandle } from "@/lib/lighter/client";
import type { CapitalAssetClass } from "@/lib/capital/markets";
import { getActiveOpenDriveWindow } from "@/lib/aziz/session/global-sessions";
import {
  DEFAULT_AZIZ_SIP_THRESHOLDS,
  type AzizSipScanRow,
  type AzizSipThresholds,
} from "./sip-types";
import { etYmd } from "./session-et";

export function quoteVol(c: LighterCandle): number {
  return c.V ?? c.v * c.c;
}

export function atr10(daily: LighterCandle[]): number {
  if (daily.length < 11) return 0;
  const slice = daily.slice(-11);
  const trs: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1];
    const cur = slice[i];
    const tr = Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c));
    trs.push(tr);
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

export function barsInWindow(candles: LighterCandle[], startMs: number, endMs: number): LighterCandle[] {
  return candles.filter((c) => c.t >= startMs && c.t < endMs);
}

export function sumQuoteVol(bars: LighterCandle[]): number {
  return bars.reduce((s, c) => s + quoteVol(c), 0);
}

export function rangeHighLow(bars: LighterCandle[]): number {
  if (!bars.length) return 0;
  const hi = Math.max(...bars.map((b) => b.h));
  const lo = Math.min(...bars.map((b) => b.l));
  return hi - lo;
}

export function computeRvolForWindow(params: {
  candles5m: LighterCandle[];
  windowStart: number;
  windowEnd: number;
}): number {
  const { candles5m, windowStart, windowEnd } = params;
  const windowMs = windowEnd - windowStart;
  const todayVol = sumQuoteVol(barsInWindow(candles5m, windowStart, windowEnd));
  if (todayVol <= 0) return 0;

  const priorVols: number[] = [];
  for (let d = 1; d <= 10; d++) {
    const pStart = windowStart - d * 24 * 60 * 60 * 1000;
    const pEnd = pStart + windowMs;
    const vol = sumQuoteVol(barsInWindow(candles5m, pStart, pEnd));
    if (vol > 0) priorVols.push(vol);
  }

  if (!priorVols.length) return todayVol > 0 ? 1 : 0;
  const avg = priorVols.reduce((a, b) => a + b, 0) / priorVols.length;
  return avg > 0 ? todayVol / avg : 0;
}

export function computeRvol(params: {
  candles5m: LighterCandle[];
  sessionYmd: string;
  windowStart: number;
  windowEnd: number;
}): number {
  return computeRvolForWindow({
    candles5m: params.candles5m,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
  });
}

function effectiveThresholds(
  thresholds: AzizSipThresholds,
  assetClass?: CapitalAssetClass | string
): AzizSipThresholds {
  const cls = assetClass ?? "shares";
  if (cls === "shares" || cls === "all") return thresholds;
  return {
    ...thresholds,
    minGapPct: cls === "forex" ? 0.15 : 0.5,
    minPriceUsd: cls === "forex" ? 0.5 : 1,
    maxPriceUsd: cls === "indices" ? 50_000 : cls === "commodities" ? 10_000 : 500,
    minQuoteVolUsd: cls === "forex" ? 0 : 10_000,
  };
}

export function sipScore(row: Omit<AzizSipScanRow, "score" | "passed" | "failures" | "ready">): number {
  const gap = row.gapPct / DEFAULT_AZIZ_SIP_THRESHOLDS.minGapPct;
  const rvol = row.rvol / DEFAULT_AZIZ_SIP_THRESHOLDS.minRvol;
  const range = row.rangeAtrMultiple / DEFAULT_AZIZ_SIP_THRESHOLDS.minRangeAtrMultiple;
  let score = gap * 0.3 + rvol * 0.45 + range * 0.25;
  if (row.changePct != null) {
    score += (Math.abs(row.changePct) / 3) * 0.15;
  }
  return score;
}

export function evaluateSip(
  metrics: {
    symbol: string;
    marketId: number;
    epic?: string;
    price: number;
    gapPct: number;
    rvol: number;
    rangeAtrMultiple: number;
    avgDailyQuoteVol: number;
    spreadPct: number | null;
    sessionDate: string;
    sessionLabel: string;
    changePct?: number | null;
    longSentimentPct?: number | null;
    moverSource?: string;
    assetClass?: string;
    activeSession?: string;
  },
  thresholds: AzizSipThresholds,
  assetClass?: CapitalAssetClass | string
): AzizSipScanRow {
  const t = effectiveThresholds(thresholds, assetClass ?? metrics.assetClass);
  const failures: string[] = [];
  if (metrics.price < t.minPriceUsd || metrics.price > t.maxPriceUsd) {
    failures.push(`price $${metrics.price.toFixed(2)} outside $${t.minPriceUsd}–$${t.maxPriceUsd}`);
  }
  if (metrics.gapPct < t.minGapPct) {
    failures.push(`impulse ${metrics.gapPct.toFixed(2)}% < ${t.minGapPct}%`);
  }
  if (metrics.rvol < t.minRvol) {
    failures.push(`RVOL ${metrics.rvol.toFixed(2)}× < ${t.minRvol}×`);
  }
  if (metrics.rangeAtrMultiple < t.minRangeAtrMultiple) {
    failures.push(`range ${metrics.rangeAtrMultiple.toFixed(2)}× ATR < ${t.minRangeAtrMultiple}×`);
  }
  if (t.minQuoteVolUsd > 0 && metrics.avgDailyQuoteVol < t.minQuoteVolUsd) {
    failures.push(`avg daily $ vol ${metrics.avgDailyQuoteVol.toFixed(0)} < ${t.minQuoteVolUsd}`);
  }
  if (metrics.spreadPct != null && metrics.spreadPct > 0.15) {
    failures.push(`spread ${metrics.spreadPct.toFixed(3)}% > 0.15%`);
  }

  const base = { ...metrics, failures, passed: failures.length === 0 };
  const score = sipScore(base);
  return {
    ...base,
    score,
    ready: base.passed,
  };
}

export function buildSipMetricsFromCandles(params: {
  symbol: string;
  marketId: number;
  epic?: string;
  sessionYmd: string;
  daily: LighterCandle[];
  candles5m: LighterCandle[];
  spreadPct: number | null;
  changePct?: number | null;
  longSentimentPct?: number | null;
  moverSource?: string;
  assetClass?: string;
  windowStart?: number;
  windowEnd?: number;
  sessionLabel?: string;
  activeSession?: string;
}): Omit<AzizSipScanRow, "score" | "passed" | "failures" | "ready"> | null {
  const { daily, candles5m } = params;
  if (daily.length < 2 || candles5m.length < 50) return null;

  const drive = getActiveOpenDriveWindow();
  const windowStart = params.windowStart ?? drive.startMs;
  const windowEnd = params.windowEnd ?? drive.endMs;
  const sessionYmd = etYmd(new Date(windowStart));
  const endTs = Date.now();

  const beforeWindow = candles5m.filter((c) => c.t < windowStart);
  const prevBar = beforeWindow[beforeWindow.length - 1];
  const windowBars = barsInWindow(candles5m, windowStart, windowEnd);
  const openBar = windowBars[0] ?? candles5m[candles5m.length - 1];
  const prevClose = prevBar?.c ?? daily[daily.length - 2]?.c ?? 0;
  const sessionOpenPrice = openBar?.o ?? openBar?.c ?? 0;
  const price = candles5m[candles5m.length - 1]?.c ?? sessionOpenPrice;

  if (!prevClose || !sessionOpenPrice || !price) return null;

  const gapPct = (Math.abs(sessionOpenPrice - prevClose) / prevClose) * 100;
  const rangeInDrive = rangeHighLow(
    windowBars.length ? windowBars : barsInWindow(candles5m, windowStart, endTs)
  );
  const atr = atr10(daily);
  const rangeAtrMultiple = atr > 0 ? rangeInDrive / atr : 0;

  const rvol = computeRvolForWindow({ candles5m, windowStart, windowEnd });

  const avgDailyQuoteVol =
    daily.slice(-10).reduce((s, d) => s + quoteVol(d), 0) / Math.max(1, Math.min(10, daily.length));

  return {
    symbol: params.symbol,
    marketId: params.marketId,
    epic: params.epic,
    price,
    gapPct,
    rvol,
    rangeAtrMultiple,
    avgDailyQuoteVol,
    spreadPct: params.spreadPct,
    sessionDate: sessionYmd,
    sessionLabel: params.sessionLabel ?? drive.label,
    changePct: params.changePct ?? null,
    longSentimentPct: params.longSentimentPct ?? null,
    moverSource: params.moverSource,
    assetClass: params.assetClass,
    activeSession: params.activeSession ?? drive.session,
  };
}
