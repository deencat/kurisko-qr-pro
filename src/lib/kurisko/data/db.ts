import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  isKuriskoDataEnabled,
  kuriskoDataDir,
  kuriskoDbPath,
  sqliteWalEnabled,
} from "./config";

const SCHEMA_VERSION = 1;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS candles (
    symbol TEXT NOT NULL,
    resolution TEXT NOT NULL,
    t INTEGER NOT NULL,
    o REAL NOT NULL,
    h REAL NOT NULL,
    l REAL NOT NULL,
    c REAL NOT NULL,
    v REAL,
    PRIMARY KEY (symbol, resolution, t)
  );

  CREATE INDEX IF NOT EXISTS idx_candles_symbol_res_t ON candles(symbol, resolution, t DESC);

  CREATE TABLE IF NOT EXISTS candle_watermarks (
    symbol TEXT NOT NULL,
    resolution TEXT NOT NULL,
    earliest_t INTEGER,
    latest_t INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (symbol, resolution)
  );

  CREATE TABLE IF NOT EXISTS scan_runs (
    id TEXT PRIMARY KEY,
    scanned_at INTEGER NOT NULL,
    symbol_count INTEGER NOT NULL,
    buy_count INTEGER NOT NULL,
    sell_count INTEGER NOT NULL,
    errors_json TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_scan_runs_scanned_at ON scan_runs(scanned_at DESC);

  CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    scan_run_id TEXT NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    scanned_at INTEGER NOT NULL,
    bar_ts INTEGER NOT NULL,
    timeframe_pair_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    side TEXT NOT NULL,
    price REAL NOT NULL,
    payload_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_scan_run ON snapshots(scan_run_id);
  CREATE INDEX IF NOT EXISTS idx_snapshots_scanned_at ON snapshots(scanned_at DESC);

  CREATE TABLE IF NOT EXISTS matrices (
    scan_run_id TEXT NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (scan_run_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    symbol TEXT NOT NULL,
    ts INTEGER NOT NULL,
    timeframe TEXT,
    side TEXT NOT NULL,
    action TEXT NOT NULL,
    from_stage TEXT NOT NULL,
    to_stage TEXT NOT NULL,
    message TEXT NOT NULL,
    price REAL NOT NULL,
    payload_json TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts DESC);
  CREATE INDEX IF NOT EXISTS idx_alerts_symbol_ts ON alerts(symbol, ts DESC);

  CREATE TABLE IF NOT EXISTS data_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

let dbInstance: Database.Database | null = null;

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const row = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
    | { value: string }
    | undefined;
  const current = row ? Number(row.value) : 0;
  if (current >= SCHEMA_VERSION) return;

  for (const sql of MIGRATIONS) {
    db.exec(sql);
  }

  db.prepare(
    "INSERT INTO schema_meta(key, value) VALUES('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(String(SCHEMA_VERSION));
}

export function getKuriskoDb(): Database.Database | null {
  if (!isKuriskoDataEnabled()) return null;

  if (dbInstance) return dbInstance;

  try {
    const dir = kuriskoDataDir();
    fs.mkdirSync(dir, { recursive: true });

    const dbPath = kuriskoDbPath();
    dbInstance = new Database(dbPath);
    dbInstance.pragma("foreign_keys = ON");
    if (sqliteWalEnabled()) {
      dbInstance.pragma("journal_mode = WAL");
    }
    runMigrations(dbInstance);

    return dbInstance;
  } catch (error) {
    console.error(
      "[kurisko-data] failed to open SQLite — continuing without persistence:",
      error instanceof Error ? error.message : error
    );
    dbInstance = null;
    return null;
  }
}

export function closeKuriskoDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function getDbSizeBytes(): number {
  if (!isKuriskoDataEnabled()) return 0;
  const dbPath = kuriskoDbPath();
  let size = 0;
  try {
    if (fs.existsSync(dbPath)) size += fs.statSync(dbPath).size;
    const wal = `${dbPath}-wal`;
    const shm = `${dbPath}-shm`;
    if (fs.existsSync(wal)) size += fs.statSync(wal).size;
    if (fs.existsSync(shm)) size += fs.statSync(shm).size;
  } catch {
    /* ignore */
  }
  return size;
}

export function checkpointWal(): void {
  const db = getKuriskoDb();
  if (!db || !sqliteWalEnabled()) return;
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    /* ignore */
  }
}

export function setDataMeta(key: string, value: string): void {
  const db = getKuriskoDb();
  if (!db) return;
  db.prepare(
    "INSERT INTO data_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function getDataMeta(key: string): string | null {
  const db = getKuriskoDb();
  if (!db) return null;
  const row = db.prepare("SELECT value FROM data_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}
