import type { DuxCandle, GusParams } from "../types";
import { etParts, parseEtClock } from "./clock";

export interface ConsolBox {
  high: number;
  low: number;
  mid: number;
  widthPct: number;
  startTs: number;
  endTs: number;
  lenMin: number;
}

/** Push % from base to extension high. */
export function pushPct(pushExt: number, pushBase: number): number {
  if (pushBase <= 0) return 0;
  return (pushExt - pushBase) / pushBase;
}

/**
 * After peak (HOD so far), start a consolidation window.
 * Valid when duration >= consol_min_minutes and width <= consol_max_width_pct.
 */
export function detectConsolClockAfterPeak(
  bars: DuxCandle[],
  peakIdx: number,
  params: GusParams,
  upToIdx: number
): ConsolBox | null {
  if (peakIdx < 0 || upToIdx <= peakIdx) return null;
  const window = bars.slice(peakIdx + 1, upToIdx + 1);
  if (window.length < params.consol_min_minutes) return null;
  // Use last consol_min_minutes bars ending at upToIdx for the box
  const boxBars = window.slice(-params.consol_min_minutes);
  const high = Math.max(...boxBars.map((b) => b.h));
  const low = Math.min(...boxBars.map((b) => b.l));
  const mid = (high + low) / 2;
  if (mid <= 0) return null;
  const widthPct = (high - low) / mid;
  if (widthPct > params.consol_max_width_pct) return null;
  return {
    high,
    low,
    mid,
    widthPct,
    startTs: boxBars[0]!.t,
    endTs: boxBars[boxBars.length - 1]!.t,
    lenMin: boxBars.length,
  };
}

export function isCrack(bar: DuxCandle, consol: ConsolBox, params: GusParams): boolean {
  const ref = params.crack_ref === "consol_mid" ? consol.mid : consol.low;
  const level = ref * (1 - params.crack_pct);
  return bar.c <= level || bar.l <= level;
}

export function volByTime(bars: DuxCandle[], upToInclusive: number): number {
  let s = 0;
  for (let i = 0; i <= upToInclusive && i < bars.length; i++) s += bars[i]!.v;
  return s;
}

export function volFracAtClock(
  rthBars: DuxCandle[],
  pmVolume: number,
  eDayVol: number,
  tClock: string
): number | null {
  if (eDayVol <= 0) return null;
  const clockMins = parseEtClock(tClock);
  let vol = pmVolume;
  for (const b of rthBars) {
    if (etParts(b.t).mins > clockMins) break;
    vol += b.v;
  }
  return vol / eDayVol;
}

export function inClockWindow(ms: number, startHhmm: string, endHhmm: string): boolean {
  const m = etParts(ms).mins;
  return m >= parseEtClock(startHhmm) && m < parseEtClock(endHhmm);
}

export function pastClock(ms: number, hhmm: string): boolean {
  return etParts(ms).mins >= parseEtClock(hhmm);
}

export function partialTriggerOk(
  bar: DuxCandle,
  prev: DuxCandle | null,
  consol: ConsolBox,
  params: GusParams
): boolean {
  switch (params.partial_trigger) {
    case "clock_10_11":
      return inClockWindow(bar.t, "10:00", "11:00");
    case "first_red_bar":
      return prev != null && bar.c < bar.o && bar.c < prev.c;
    case "break_consol_mid":
      return bar.c < consol.mid;
    default:
      return false;
  }
}

export function stopPrice(consol: ConsolBox, pushExt: number, params: GusParams): number {
  const raw = params.stop_ref === "push_ext" ? pushExt : consol.high;
  return raw * (1 + params.stop_buffer_pct);
}
