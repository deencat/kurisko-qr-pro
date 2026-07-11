import type { LighterCandle } from "@/lib/lighter/client";
import { buildMarketContext } from "@/lib/aziz/backtest/engine-common";

export interface SessionVwapSeries {
  sessionVwap: number[];
  isNewDay: boolean[];
}

/** Session-anchored VWAP (ET calendar day reset) — same as Aziz S6. */
export function buildSessionVwap(candles: LighterCandle[]): SessionVwapSeries {
  const ctx = buildMarketContext(candles);
  return { sessionVwap: ctx.sessionVwap, isNewDay: ctx.isNewDay };
}
