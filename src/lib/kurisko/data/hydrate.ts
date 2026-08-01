import "server-only";

import { hydrateAlertsFromDb } from "@/lib/kurisko/snapshot/alert-store";
import { setCachedScan } from "@/lib/kurisko/snapshot/scan-store";
import { hydrateAlertsIntoMemory } from "./alert-store-persist";
import { backfillAllScanSymbols } from "./backfill-service";
import { backfillOnStart, candleBackfillEveryTick, isKuriskoDataEnabled, snapshotPersistEnabled } from "./config";
import { getKuriskoDb, setDataMeta } from "./db";
import { getLatestScanRun, loadScanFeed } from "./snapshot-store";

const HYDRATE_STALE_MS = 120 * 60_000;

function log(msg: string) {
  console.info(`[kurisko-data] ${msg}`);
}

export async function hydrateKuriskoData(): Promise<void> {
  if (!isKuriskoDataEnabled()) {
    log("persistence disabled (KURISKO_DATA_ENABLED=false)");
    return;
  }

  const db = getKuriskoDb();
  if (!db) {
    log("database unavailable");
    return;
  }

  log("hydrating from SQLite…");

  if (snapshotPersistEnabled()) {
    const latest = getLatestScanRun();
    if (latest) {
      const age = Date.now() - latest.scannedAt;
      if (age < HYDRATE_STALE_MS) {
        const feed = loadScanFeed(latest.id);
        if (feed?.results.length) {
          setCachedScan(
            {
              scannedAt: feed.scannedAt,
              symbols: feed.symbols,
              results: feed.results,
              buyCount: feed.buyCount,
              sellCount: feed.sellCount,
              ...(feed.errors?.length ? { errors: feed.errors } : {}),
            },
            feed.matrices ?? {}
          );
          log(`hydrated hot cache from scan run ${latest.id} (${feed.results.length} symbols)`);
        }
      }
    }

    const storedAlerts = hydrateAlertsIntoMemory(80);
    if (storedAlerts.length) {
      hydrateAlertsFromDb(storedAlerts);
      log(`hydrated ${storedAlerts.length} alerts into memory`);
    }
  }

  if (backfillOnStart()) {
    try {
      await backfillAllScanSymbols({ cold: false });
    } catch (error) {
      log(`startup backfill failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  setDataMeta("lastHydrateAt", String(Date.now()));
  log("hydration complete");
}

export async function runTickCandleBackfill(): Promise<void> {
  if (!isKuriskoDataEnabled() || !candleBackfillEveryTick()) return;

  try {
    await backfillAllScanSymbols({ cold: false });
  } catch (error) {
    log(`tick backfill failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
