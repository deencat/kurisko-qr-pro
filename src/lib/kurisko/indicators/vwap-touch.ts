import type { LighterCandle } from "@/lib/lighter/client";

export type VwapApproach = "from_above" | "from_below";

function nearVwap(price: number, vwap: number, tolerancePct: number): boolean {
  return Math.abs(price - vwap) / Math.max(Math.abs(price), 1e-9) <= tolerancePct;
}

/** Bar intersects VWAP band (wick cross or body touch). */
export function barTouchesVwap(
  candle: LighterCandle,
  vwap: number,
  tolerancePct: number
): boolean {
  if (!Number.isFinite(vwap) || vwap <= 0) return false;
  const lo = vwap * (1 - tolerancePct);
  const hi = vwap * (1 + tolerancePct);
  return candle.l <= hi && candle.h >= lo;
}

/** Price was clearly on one side of VWAP (not hugging). */
export function priceAboveVwap(candle: LighterCandle, vwap: number, tolerancePct: number): boolean {
  return candle.c > vwap * (1 + tolerancePct);
}

export function priceBelowVwap(candle: LighterCandle, vwap: number, tolerancePct: number): boolean {
  return candle.c < vwap * (1 - tolerancePct);
}

/**
 * Kurisko Quad Rotation pillar: first touch of session VWAP after trading away from it.
 * Long: price fell from above → first tag of VWAP at/near support.
 * Short: price rose from below → first tag from below.
 */
export function isFirstVwapTouch(
  candles: LighterCandle[],
  sessionVwap: number[],
  isNewDay: boolean[],
  i: number,
  approach: VwapApproach,
  tolerancePct = 0.0015,
  minSeparationBars = 4
): boolean {
  const c = candles[i];
  const vwap = sessionVwap[i];
  if (!c || !Number.isFinite(vwap) || vwap <= 0) return false;
  if (!barTouchesVwap(c, vwap, tolerancePct)) return false;

  // Earlier touch this session → not "first"
  for (let j = i - 1; j >= 0; j--) {
    if (j + 1 < candles.length && isNewDay[j + 1]) break;
    const prev = candles[j]!;
    const pv = sessionVwap[j]!;
    if (barTouchesVwap(prev, pv, tolerancePct)) return false;
  }

  let separation = 0;
  for (let j = i - 1; j >= 0; j--) {
    if (j + 1 < candles.length && isNewDay[j + 1]) break;
    const prev = candles[j]!;
    const pv = sessionVwap[j]!;
    if (approach === "from_above" && priceAboveVwap(prev, pv, tolerancePct)) separation++;
    else if (approach === "from_below" && priceBelowVwap(prev, pv, tolerancePct)) separation++;
    else if (barTouchesVwap(prev, pv, tolerancePct)) break;
    else break;
  }

  return separation >= Math.min(minSeparationBars, 3);
}

/** Confluence helper: first touch OR close near VWAP (for diagnostics / optional strict mode). */
export function vwapConfluenceLong(
  candles: LighterCandle[],
  sessionVwap: number[],
  isNewDay: boolean[],
  i: number,
  tolerancePct: number
): boolean {
  const c = candles[i]!;
  const vwap = sessionVwap[i]!;
  if (!Number.isFinite(vwap)) return false;
  return (
    isFirstVwapTouch(candles, sessionVwap, isNewDay, i, "from_above", tolerancePct) ||
    nearVwap(c.c, vwap, tolerancePct * 2) ||
    nearVwap(c.l, vwap, tolerancePct * 2)
  );
}

export function vwapConfluenceShort(
  candles: LighterCandle[],
  sessionVwap: number[],
  isNewDay: boolean[],
  i: number,
  tolerancePct: number
): boolean {
  const c = candles[i]!;
  const vwap = sessionVwap[i]!;
  if (!Number.isFinite(vwap)) return false;
  return (
    isFirstVwapTouch(candles, sessionVwap, isNewDay, i, "from_below", tolerancePct) ||
    nearVwap(c.c, vwap, tolerancePct * 2) ||
    nearVwap(c.h, vwap, tolerancePct * 2)
  );
}
