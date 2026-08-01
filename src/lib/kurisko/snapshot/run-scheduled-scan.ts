import "server-only";

import { scanAzizSipCapital } from "@/lib/aziz/scan/capital-sip-scanner";
import { buildAllSymbolLevels } from "./build-levels";
import { buildKuriskoMatrix } from "./build-matrix";
import {
  buildKuriskoSnapshot,
  KURISKO_DEFAULT_SCAN_SYMBOLS,
} from "./build-snapshot";
import { countBuySell, recordSnapshotTransition } from "./alert-store";
import { snapshotPersistEnabled } from "@/lib/kurisko/data/config";
import { runTickCandleBackfill } from "@/lib/kurisko/data/hydrate";
import { saveScanRun } from "@/lib/kurisko/data/snapshot-store";
import {
  setCachedGapScan,
  setCachedLevels,
  setCachedPremarket,
  setCachedScan,
  setScanInProgress,
} from "./scan-store";
import type { KuriskoMatrix, KuriskoScanResult } from "./types";

const SCAN_SYMBOL_DELAY_MS = 1200;
const DEFAULT_TIMEFRAME_PAIR_ID = "1m+5m";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RunKuriskoScanOptions {
  symbols?: string[];
  timeframePairId?: string;
  includeWidgets?: boolean;
  includeLevels?: boolean;
}

export async function runKuriskoScan(options: RunKuriskoScanOptions = {}): Promise<KuriskoScanResult> {
  const symbols = options.symbols ?? [...KURISKO_DEFAULT_SCAN_SYMBOLS];
  const timeframePairId = options.timeframePairId ?? DEFAULT_TIMEFRAME_PAIR_ID;
  const includeWidgets = options.includeWidgets ?? true;
  const includeLevels = options.includeLevels ?? false;

  setScanInProgress(true);

  const results = [];
  const errors: { symbol: string; error: string }[] = [];
  const matrices: Record<string, KuriskoMatrix | null> = {};

  try {
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i]!;
      if (i > 0) await sleep(SCAN_SYMBOL_DELAY_MS);
      try {
        const snapshot = await buildKuriskoSnapshot({ symbol, timeframePairId });
        recordSnapshotTransition(snapshot);
        results.push(snapshot);
        try {
          matrices[symbol] = await buildKuriskoMatrix(symbol);
        } catch {
          matrices[symbol] = null;
        }
      } catch (e) {
        errors.push({
          symbol,
          error: e instanceof Error ? e.message : "Snapshot failed",
        });
        matrices[symbol] = null;
      }
    }

    const { buyCount, sellCount } = countBuySell(results);

    const payload: KuriskoScanResult = {
      scannedAt: Date.now(),
      symbols,
      results,
      buyCount,
      sellCount,
      ...(errors.length ? { errors } : {}),
    };

    setCachedScan(payload, matrices);

    if (snapshotPersistEnabled()) {
      try {
        saveScanRun(payload, matrices);
      } catch (error) {
        console.error("[kurisko-data] snapshot persist failed:", error);
      }
    }

    try {
      await runTickCandleBackfill();
    } catch (error) {
      console.error("[kurisko-data] tick candle backfill failed:", error);
    }

    if (includeLevels) {
      try {
        const levels = await buildAllSymbolLevels(symbols);
        setCachedLevels({ scannedAt: Date.now(), symbols: levels });
      } catch {
        /* non-fatal */
      }
    }

    if (includeWidgets) {
      try {
        const gap = await scanAzizSipCapital({
          universe: "capital_gainers",
          maxSymbols: 8,
          thresholds: {
            minGapPct: 0.5,
            minRvol: 1.0,
            minPriceUsd: 3,
            maxPriceUsd: 500,
          },
        });
        setCachedGapScan(gap);
      } catch {
        /* non-fatal */
      }

      try {
        const premarket = await scanAzizSipCapital({
          universe: "capital_volatile",
          maxSymbols: 6,
          thresholds: {
            minGapPct: 0.3,
            minRvol: 0.8,
            minPriceUsd: 3,
            maxPriceUsd: 500,
          },
        });
        setCachedPremarket(premarket);
      } catch {
        /* non-fatal */
      }
    }

    return payload;
  } finally {
    setScanInProgress(false);
  }
}
