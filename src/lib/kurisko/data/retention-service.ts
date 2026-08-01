import "server-only";

import {
  alertRetentionMs,
  candleRetentionMs,
  isKuriskoDataEnabled,
  snapshotRetentionMs,
} from "./config";
import { pruneCandlesBefore } from "./candle-store";
import { checkpointWal } from "./db";
import { pruneAlertsBefore } from "./alert-store-persist";
import { pruneScanRunsBefore } from "./snapshot-store";

function log(msg: string) {
  console.info(`[kurisko-data] ${msg}`);
}

export function runRetentionPrune(): {
  candles: number;
  scanRuns: number;
  alerts: number;
} {
  if (!isKuriskoDataEnabled()) {
    return { candles: 0, scanRuns: 0, alerts: 0 };
  }

  const now = Date.now();
  const candleCutoff = now - candleRetentionMs();
  const snapshotCutoff = now - snapshotRetentionMs();
  const alertCutoff = now - alertRetentionMs();

  const candles = pruneCandlesBefore(candleCutoff);
  const scanRuns = pruneScanRunsBefore(snapshotCutoff);
  const alerts = pruneAlertsBefore(alertCutoff);

  if (candles || scanRuns || alerts) {
    log(`retention prune: candles=${candles} scanRuns=${scanRuns} alerts=${alerts}`);
    checkpointWal();
  }

  return { candles, scanRuns, alerts };
}

/** Run retention at most once per 24h. */
let lastRetentionAt = 0;
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function maybeRunRetention(): void {
  const now = Date.now();
  if (now - lastRetentionAt < RETENTION_INTERVAL_MS) return;
  lastRetentionAt = now;
  runRetentionPrune();
}
