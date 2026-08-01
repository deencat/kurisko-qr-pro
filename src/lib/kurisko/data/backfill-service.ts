import "server-only";

import type { CandleResolution } from "@/lib/lighter/client";
import {
  fetchAllCapitalCandles,
  fetchCapitalCandlesDelta,
  isCapitalConfigured,
} from "@/lib/capital/client";
import { KURISKO_DEFAULT_SCAN_SYMBOLS } from "@/lib/kurisko/snapshot/build-snapshot";
import { candleRetentionMs, isKuriskoDataEnabled } from "./config";
import { getCandleRange, getWatermark, upsertCandles } from "./candle-store";
import { getDataMeta, setDataMeta } from "./db";

const SYMBOL_DELAY_MS = 1200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg: string) {
  console.info(`[kurisko-data] ${msg}`);
}

export async function backfillSymbolCandles(
  symbol: string,
  resolution: CandleResolution = "1m",
  options: { cold?: boolean; endTs?: number } = {}
): Promise<{ inserted: number; mode: "cold" | "delta" | "skip" }> {
  if (!isKuriskoDataEnabled() || !isCapitalConfigured()) {
    return { inserted: 0, mode: "skip" };
  }

  const sym = symbol.toUpperCase();
  const endTs = options.endTs ?? Date.now();
  const retentionStart = endTs - candleRetentionMs();
  const watermark = getWatermark(sym, resolution);

  if (options.cold || !watermark?.latestT) {
    log(`cold backfill ${sym} ${resolution} from ${new Date(retentionStart).toISOString()}`);
    const full = await fetchAllCapitalCandles({
      symbol: sym,
      resolution,
      startTimestamp: retentionStart,
      endTimestamp: endTs,
    });
    const inserted = upsertCandles(sym, resolution, full.candles);
    setDataMeta("lastBackfillAt", String(Date.now()));
    return { inserted, mode: "cold" };
  }

  log(`delta backfill ${sym} ${resolution} after ${new Date(watermark.latestT).toISOString()}`);
  const delta = await fetchCapitalCandlesDelta({
    symbol: sym,
    resolution,
    afterTimestamp: watermark.latestT,
    endTimestamp: endTs,
  });

  if (delta.candles.length === 0) {
    return { inserted: 0, mode: "delta" };
  }

  const inserted = upsertCandles(sym, resolution, delta.candles);
  setDataMeta("lastBackfillAt", String(Date.now()));
  return { inserted, mode: "delta" };
}

export async function backfillAllScanSymbols(
  options: { cold?: boolean } = {}
): Promise<{ symbol: string; inserted: number; mode: string }[]> {
  const results: { symbol: string; inserted: number; mode: string }[] = [];

  for (let i = 0; i < KURISKO_DEFAULT_SCAN_SYMBOLS.length; i++) {
    const symbol = KURISKO_DEFAULT_SCAN_SYMBOLS[i]!;
    if (i > 0) await sleep(SYMBOL_DELAY_MS);
    try {
      const r = await backfillSymbolCandles(symbol, "1m", options);
      results.push({ symbol, inserted: r.inserted, mode: r.mode });
      log(`${symbol}: ${r.mode} +${r.inserted} bars`);
    } catch (error) {
      log(`${symbol} backfill failed: ${error instanceof Error ? error.message : String(error)}`);
      results.push({ symbol, inserted: 0, mode: "error" });
    }
  }

  return results;
}

export function readLocalCandles(
  symbol: string,
  resolution: CandleResolution,
  startTs: number,
  endTs: number
) {
  return getCandleRange(symbol, resolution, startTs, endTs);
}

export function getLastBackfillAt(): number | null {
  const raw = getDataMeta("lastBackfillAt");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function detectHistoryShortfall(
  symbol: string,
  resolution: CandleResolution,
  requestedDays: number,
  endTs: number
): boolean {
  const watermark = getWatermark(symbol, resolution);
  if (!watermark?.earliestT || !watermark.latestT) return true;

  const retentionStart = endTs - candleRetentionMs();
  const expectedStart = endTs - requestedDays * 24 * 60 * 60 * 1000;
  const needStart = Math.max(retentionStart, expectedStart);

  if (watermark.earliestT > needStart + 24 * 60 * 60 * 1000) return true;

  const candles = getCandleRange(symbol, resolution, needStart, endTs);
  const calendarDays =
    candles.length >= 2
      ? Math.max(1, Math.round((candles[candles.length - 1]!.t - candles[0]!.t) / (24 * 60 * 60 * 1000)))
      : 0;

  return requestedDays > calendarDays + 5;
}
