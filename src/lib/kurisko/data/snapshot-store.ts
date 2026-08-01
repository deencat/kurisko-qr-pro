import "server-only";

import { randomUUID } from "node:crypto";
import type {
  KuriskoMatrix,
  KuriskoScanFeed,
  KuriskoScanResult,
  KuriskoSnapshot,
} from "@/lib/kurisko/snapshot/types";
import { getKuriskoDb } from "./db";

export interface StoredScanRun {
  id: string;
  scannedAt: number;
  symbolCount: number;
  buyCount: number;
  sellCount: number;
  errors?: { symbol: string; error: string }[];
}

export function saveScanRun(
  result: KuriskoScanResult,
  matrices: Record<string, KuriskoMatrix | null>
): string | null {
  const db = getKuriskoDb();
  if (!db) return null;

  const id = randomUUID();
  const errorsJson = result.errors?.length ? JSON.stringify(result.errors) : null;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO scan_runs(id, scanned_at, symbol_count, buy_count, sell_count, errors_json)
       VALUES(?, ?, ?, ?, ?, ?)`
    ).run(id, result.scannedAt, result.results.length, result.buyCount, result.sellCount, errorsJson);

    const snapInsert = db.prepare(
      `INSERT INTO snapshots(id, scan_run_id, symbol, scanned_at, bar_ts, timeframe_pair_id, stage, side, price, payload_json)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const s of result.results) {
      snapInsert.run(
        randomUUID(),
        id,
        s.symbol,
        s.scannedAt,
        s.barTs,
        s.timeframePairId,
        s.stage,
        s.side,
        s.price,
        JSON.stringify(s)
      );
    }

    const matrixInsert = db.prepare(
      `INSERT INTO matrices(scan_run_id, symbol, payload_json) VALUES(?, ?, ?)`
    );

    for (const [symbol, matrix] of Object.entries(matrices)) {
      if (matrix) {
        matrixInsert.run(id, symbol.toUpperCase(), JSON.stringify(matrix));
      }
    }
  });

  tx();
  return id;
}

export function getLatestScanRun(): StoredScanRun | null {
  const db = getKuriskoDb();
  if (!db) return null;

  const row = db
    .prepare(
      `SELECT id, scanned_at, symbol_count, buy_count, sell_count, errors_json
       FROM scan_runs ORDER BY scanned_at DESC LIMIT 1`
    )
    .get() as
    | {
        id: string;
        scanned_at: number;
        symbol_count: number;
        buy_count: number;
        sell_count: number;
        errors_json: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    scannedAt: row.scanned_at,
    symbolCount: row.symbol_count,
    buyCount: row.buy_count,
    sellCount: row.sell_count,
    errors: row.errors_json ? JSON.parse(row.errors_json) : undefined,
  };
}

export function getScanRunAt(timestamp: number): StoredScanRun | null {
  const db = getKuriskoDb();
  if (!db) return null;

  const row = db
    .prepare(
      `SELECT id, scanned_at, symbol_count, buy_count, sell_count, errors_json
       FROM scan_runs WHERE scanned_at <= ? ORDER BY scanned_at DESC LIMIT 1`
    )
    .get(timestamp) as
    | {
        id: string;
        scanned_at: number;
        symbol_count: number;
        buy_count: number;
        sell_count: number;
        errors_json: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    scannedAt: row.scanned_at,
    symbolCount: row.symbol_count,
    buyCount: row.buy_count,
    sellCount: row.sell_count,
    errors: row.errors_json ? JSON.parse(row.errors_json) : undefined,
  };
}

export function getScanRunById(id: string): StoredScanRun | null {
  const db = getKuriskoDb();
  if (!db) return null;

  const row = db
    .prepare(
      `SELECT id, scanned_at, symbol_count, buy_count, sell_count, errors_json
       FROM scan_runs WHERE id = ?`
    )
    .get(id) as
    | {
        id: string;
        scanned_at: number;
        symbol_count: number;
        buy_count: number;
        sell_count: number;
        errors_json: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    scannedAt: row.scanned_at,
    symbolCount: row.symbol_count,
    buyCount: row.buy_count,
    sellCount: row.sell_count,
    errors: row.errors_json ? JSON.parse(row.errors_json) : undefined,
  };
}

export function listScanRuns(fromTs: number, toTs: number, limit = 100): StoredScanRun[] {
  const db = getKuriskoDb();
  if (!db) return [];

  const rows = db
    .prepare(
      `SELECT id, scanned_at, symbol_count, buy_count, sell_count, errors_json
       FROM scan_runs WHERE scanned_at >= ? AND scanned_at <= ?
       ORDER BY scanned_at DESC LIMIT ?`
    )
    .all(fromTs, toTs, limit) as Array<{
    id: string;
    scanned_at: number;
    symbol_count: number;
    buy_count: number;
    sell_count: number;
    errors_json: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    scannedAt: row.scanned_at,
    symbolCount: row.symbol_count,
    buyCount: row.buy_count,
    sellCount: row.sell_count,
    errors: row.errors_json ? JSON.parse(row.errors_json) : undefined,
  }));
}

export function getAdjacentScanRun(
  scanRunId: string,
  direction: "prev" | "next"
): StoredScanRun | null {
  const db = getKuriskoDb();
  if (!db) return null;

  const current = getScanRunById(scanRunId);
  if (!current) return null;

  const sql =
    direction === "prev"
      ? `SELECT id, scanned_at, symbol_count, buy_count, sell_count, errors_json
         FROM scan_runs WHERE scanned_at < ? ORDER BY scanned_at DESC LIMIT 1`
      : `SELECT id, scanned_at, symbol_count, buy_count, sell_count, errors_json
         FROM scan_runs WHERE scanned_at > ? ORDER BY scanned_at ASC LIMIT 1`;

  const row = db.prepare(sql).get(current.scannedAt) as
    | {
        id: string;
        scanned_at: number;
        symbol_count: number;
        buy_count: number;
        sell_count: number;
        errors_json: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    scannedAt: row.scanned_at,
    symbolCount: row.symbol_count,
    buyCount: row.buy_count,
    sellCount: row.sell_count,
    errors: row.errors_json ? JSON.parse(row.errors_json) : undefined,
  };
}

export function loadScanFeed(scanRunId: string): KuriskoScanFeed | null {
  const db = getKuriskoDb();
  if (!db) return null;

  const run = getScanRunById(scanRunId);
  if (!run) return null;

  const snapRows = db
    .prepare(`SELECT payload_json FROM snapshots WHERE scan_run_id = ? ORDER BY symbol ASC`)
    .all(scanRunId) as Array<{ payload_json: string }>;

  const results: KuriskoSnapshot[] = snapRows.map((r) => JSON.parse(r.payload_json) as KuriskoSnapshot);

  const matrixRows = db
    .prepare(`SELECT symbol, payload_json FROM matrices WHERE scan_run_id = ?`)
    .all(scanRunId) as Array<{ symbol: string; payload_json: string }>;

  const matrices: Record<string, KuriskoMatrix | null> = {};
  for (const r of matrixRows) {
    matrices[r.symbol] = JSON.parse(r.payload_json) as KuriskoMatrix;
  }

  const symbols = [...new Set(results.map((s) => s.symbol))];

  return {
    scannedAt: run.scannedAt,
    symbols,
    results,
    buyCount: run.buyCount,
    sellCount: run.sellCount,
    ...(run.errors?.length ? { errors: run.errors } : {}),
    matrices,
    scanning: false,
    stale: false,
    replayMode: "snapshot",
    scanRunId: run.id,
  };
}

export function countScanRuns(): number {
  const db = getKuriskoDb();
  if (!db) return 0;
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM scan_runs").get() as { cnt: number };
  return row?.cnt ?? 0;
}

export function getScanRunTimeRange(): { oldestAt: number | null; newestAt: number | null } {
  const db = getKuriskoDb();
  if (!db) return { oldestAt: null, newestAt: null };

  const row = db
    .prepare("SELECT MIN(scanned_at) AS oldest, MAX(scanned_at) AS newest FROM scan_runs")
    .get() as { oldest: number | null; newest: number | null };

  return { oldestAt: row?.oldest ?? null, newestAt: row?.newest ?? null };
}

export function pruneScanRunsBefore(beforeTs: number): number {
  const db = getKuriskoDb();
  if (!db) return 0;

  const ids = db
    .prepare("SELECT id FROM scan_runs WHERE scanned_at < ?")
    .all(beforeTs) as Array<{ id: string }>;

  if (!ids.length) return 0;

  const tx = db.transaction(() => {
    for (const { id } of ids) {
      db.prepare("DELETE FROM snapshots WHERE scan_run_id = ?").run(id);
      db.prepare("DELETE FROM matrices WHERE scan_run_id = ?").run(id);
      db.prepare("DELETE FROM scan_runs WHERE id = ?").run(id);
    }
  });

  tx();
  return ids.length;
}
