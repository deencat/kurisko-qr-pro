/**
 * Script-safe Capital bar → candle (no server-only).
 */
import type { LighterCandle } from "@/lib/lighter/client";
import { synthesizeBarVolume } from "@/lib/capital/volume";

interface PriceLevel {
  bid?: number;
  ask?: number;
  lastTraded?: number;
}

export interface CapitalPriceBar {
  snapshotTimeUTC?: number;
  snapshotTime?: string;
  openPrice?: PriceLevel;
  highPrice?: PriceLevel;
  lowPrice?: PriceLevel;
  closePrice?: PriceLevel;
  lastTradedVolume?: number;
}

function bidPx(level?: PriceLevel): number {
  if (!level) return 0;
  return level.bid ?? level.lastTraded ?? 0;
}

function askPx(level?: PriceLevel): number {
  if (!level) return 0;
  const bid = bidPx(level);
  return level.ask ?? bid;
}

function mid(level?: PriceLevel): number {
  const bid = bidPx(level);
  const ask = askPx(level);
  if (!bid && !ask) return 0;
  if (!ask) return bid;
  return (bid + ask) / 2;
}

function toMs(ts: number | string | undefined): number {
  if (ts == null) return 0;
  if (typeof ts === "number") return ts < 1e12 ? ts * 1000 : ts;
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function capitalBarToCandle(bar: CapitalPriceBar): LighterCandle | null {
  const t = toMs(bar.snapshotTimeUTC ?? bar.snapshotTime);
  const o = mid(bar.openPrice);
  const h = mid(bar.highPrice);
  const l = mid(bar.lowPrice);
  const c = mid(bar.closePrice);
  if (!t || !o || !h || !l || !c) return null;
  const reported = bar.lastTradedVolume ?? 0;
  const v = reported > 0 ? reported : synthesizeBarVolume({ o, h, l, c });
  return { t, o, h, l, c, v, V: v * c };
}
