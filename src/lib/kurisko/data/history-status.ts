import "server-only";

import type { CandleResolution } from "@/lib/lighter/client";
import { detectHistoryShortfall, getLastBackfillAt } from "./backfill-service";
import { getAllWatermarks, getCandleCountsBySymbol } from "./candle-store";
import { isKuriskoDataEnabled, kuriskoDbPath } from "./config";
import { getDataMeta, getDbSizeBytes } from "./db";
import { countAlerts } from "./alert-store-persist";
import { countScanRuns, getScanRunTimeRange } from "./snapshot-store";

export interface KuriskoHistoryStatus {
  enabled: boolean;
  dbPath: string;
  dbSizeBytes: number;
  candles: Record<string, Record<string, { count: number; earliest_t: number | null; latest_t: number | null }>>;
  scanRuns: { count: number; oldestAt: number | null; newestAt: number | null };
  alerts: { count: number };
  lastBackfillAt: number | null;
  lastHydrateAt: number | null;
  historyShortfall: boolean;
}

export function getKuriskoHistoryStatus(): KuriskoHistoryStatus {
  const enabled = isKuriskoDataEnabled();
  const counts = getCandleCountsBySymbol();
  const watermarks = getAllWatermarks();

  const candles: KuriskoHistoryStatus["candles"] = {};
  for (const wm of watermarks) {
    candles[wm.symbol] ??= {};
    candles[wm.symbol]![wm.resolution] = {
      count: counts[wm.symbol]?.[wm.resolution] ?? 0,
      earliest_t: wm.earliestT,
      latest_t: wm.latestT,
    };
  }

  let historyShortfall = false;
  if (enabled) {
    for (const wm of watermarks) {
      if (
        detectHistoryShortfall(wm.symbol, wm.resolution as CandleResolution, 2, Date.now())
      ) {
        historyShortfall = true;
        break;
      }
    }
  }

  const range = getScanRunTimeRange();

  return {
    enabled,
    dbPath: kuriskoDbPath(),
    dbSizeBytes: getDbSizeBytes(),
    candles,
    scanRuns: {
      count: countScanRuns(),
      oldestAt: range.oldestAt,
      newestAt: range.newestAt,
    },
    alerts: { count: countAlerts() },
    lastBackfillAt: getLastBackfillAt(),
    lastHydrateAt: (() => {
      const raw = getDataMeta("lastHydrateAt");
      return raw ? Number(raw) : null;
    })(),
    historyShortfall,
  };
}
