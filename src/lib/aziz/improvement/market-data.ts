import "server-only";

import type { CandleResolution, LighterCandle } from "@/lib/lighter/client";
import {
  fetchAllCapitalCandles,
  fetchCapitalCandlesDelta,
  isCapitalConfigured,
} from "@/lib/capital/client";
import { capitalBarMs } from "@/lib/capital/resolutions";
import type { CapitalVolumeMode } from "@/lib/capital/volume";
import { ensureCapitalVolumes } from "@/lib/capital/volume";

export type AzizDataSource = "capital";

export interface AzizMarketData {
  symbol: string;
  resolution: CandleResolution;
  startTs: number;
  endTs: number;
  candles: LighterCandle[];
  requestedDays: number;
  fetchDays: number;
  calendarDaysCovered: number;
  historyShortfall: boolean;
  cacheBars: number | null;
  dataSource: AzizDataSource;
  epic?: string;
  volumeMode?: CapitalVolumeMode;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AZIZ_MAX_BACKTEST_DAYS = 60;
const AZIZ_WARMUP_BARS = 400;
const sessionCache = new Map<string, AzizMarketData>();

function barsPerDay(resolution: CandleResolution): number {
  switch (resolution) {
    case "1m": return 1440;
    case "5m": return 288;
    case "15m": return 96;
    case "30m": return 48;
    case "1h": return 24;
    case "4h": return 6;
    case "1d": return 1;
    default: return 288;
  }
}

function azizFetchDaysForHistory(requestedDays: number, resolution: CandleResolution): number {
  return requestedDays + Math.ceil(AZIZ_WARMUP_BARS / barsPerDay(resolution));
}

function azizMinBarsForHistory(requestedDays: number, resolution: CandleResolution): number {
  return azizFetchDaysForHistory(requestedDays, resolution) * barsPerDay(resolution);
}

function mergeCandlesByTime(a: LighterCandle[], b: LighterCandle[]): LighterCandle[] {
  const m = new Map<number, LighterCandle>();
  for (const c of a) m.set(c.t, c);
  for (const c of b) m.set(c.t, c);
  return [...m.values()].sort((x, y) => x.t - y.t);
}

function calendarDaysFromCandles(candles: LighterCandle[]): number {
  const firstTs = candles[0]?.t;
  const lastTs = candles[candles.length - 1]?.t;
  if (!firstTs || !lastTs) return 0;
  return Math.max(1, Math.round((lastTs - firstTs) / MS_PER_DAY));
}

export async function loadAzizMarketData(params: {
  symbol: string;
  resolution: CandleResolution;
  days: number;
  endTs?: number;
  dataSource?: AzizDataSource;
}): Promise<AzizMarketData> {
  const days = Math.min(AZIZ_MAX_BACKTEST_DAYS, Math.max(1, params.days));
  const endTs = params.endTs ?? Date.now();
  const fetchDays = azizFetchDaysForHistory(days, params.resolution);
  const minBars = azizMinBarsForHistory(days, params.resolution);
  const startTs = endTs - fetchDays * MS_PER_DAY;
  const key = `capital|${params.symbol}|${params.resolution}|${startTs}|${endTs}`;

  const cached = sessionCache.get(key);
  if (cached && cached.candles.length >= Math.min(minBars, 200) && !cached.historyShortfall) {
    return cached;
  }

  if (!isCapitalConfigured()) {
    throw new Error("Capital.com not configured. Set CAPITAL_API_KEY, CAPITAL_IDENTIFIER, CAPITAL_API_PASSWORD.");
  }

  const full = await fetchAllCapitalCandles({
    symbol: params.symbol,
    resolution: params.resolution,
    startTimestamp: startTs,
    endTimestamp: endTs,
    minBars,
  });

  const candles = full.candles.filter((c) => c.t >= startTs && c.t <= endTs);
  const normalized = ensureCapitalVolumes(candles);
  const calendarDaysCovered = calendarDaysFromCandles(candles);

  const data: AzizMarketData = {
    symbol: params.symbol,
    resolution: params.resolution,
    startTs,
    endTs,
    candles: normalized.candles,
    requestedDays: days,
    fetchDays,
    calendarDaysCovered,
    historyShortfall: days > calendarDaysCovered + 5,
    cacheBars: null,
    dataSource: "capital",
    epic: full.epic,
    volumeMode: normalized.volumeMode,
  };
  sessionCache.set(key, data);
  return data;
}

export function clearAzizMarketDataCache() {
  sessionCache.clear();
}
