import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { duxDataDir, duxDbPath } from "./config";
import { classifyUsSession } from "./session";
import type { DuxCandle, DuxIngestLogRow, DuxSymbolMeta } from "./types";

let dbSingleton: DatabaseSync | null = null;

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function openDuxDb(dbPath = duxDbPath()): DatabaseSync {
  ensureDir(path.dirname(dbPath));
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS candles (
      symbol TEXT NOT NULL,
      resolution TEXT NOT NULL,
      session TEXT NOT NULL,
      t INTEGER NOT NULL,
      o REAL NOT NULL,
      h REAL NOT NULL,
      l REAL NOT NULL,
      c REAL NOT NULL,
      v REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'futu',
      ingested_at INTEGER NOT NULL,
      PRIMARY KEY (symbol, resolution, t)
    );
    CREATE INDEX IF NOT EXISTS idx_candles_sym_res_t
      ON candles(symbol, resolution, t);
    CREATE INDEX IF NOT EXISTS idx_candles_sym_res_sess_t
      ON candles(symbol, resolution, session, t);

    CREATE TABLE IF NOT EXISTS symbols (
      symbol TEXT PRIMARY KEY,
      float_shares REAL,
      mcap_usd REAL,
      sector TEXT,
      is_biotech INTEGER NOT NULL DEFAULT 0,
      is_energy INTEGER NOT NULL DEFAULT 0,
      is_china_adr INTEGER NOT NULL DEFAULT 0,
      as_of INTEGER,
      source TEXT NOT NULL DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS ingest_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      resolution TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      bars INTEGER NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      at INTEGER NOT NULL
    );
  `);
  return db;
}

export function getDuxDb(): DatabaseSync {
  if (!dbSingleton) dbSingleton = openDuxDb();
  return dbSingleton;
}

export function closeDuxDb(): void {
  dbSingleton?.close();
  dbSingleton = null;
}

export function upsertCandles(candles: DuxCandle[], db = getDuxDb()): number {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO candles (symbol, resolution, session, t, o, h, l, c, v, source, ingested_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, resolution, t) DO UPDATE SET
      session=excluded.session,
      o=excluded.o, h=excluded.h, l=excluded.l, c=excluded.c, v=excluded.v,
      source=excluded.source, ingested_at=excluded.ingested_at
  `);
  db.exec("BEGIN");
  try {
    for (const c of candles) {
      stmt.run(
        c.symbol,
        c.resolution,
        c.session,
        c.t,
        c.o,
        c.h,
        c.l,
        c.c,
        c.v,
        c.source,
        now
      );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return candles.length;
}

export function getCandles(params: {
  symbol: string;
  resolution: "1m" | "1d";
  startTs?: number;
  endTs?: number;
  session?: DuxCandle["session"];
}): DuxCandle[] {
  const db = getDuxDb();
  const clauses = ["symbol = ?", "resolution = ?"];
  const args: (string | number)[] = [params.symbol, params.resolution];
  if (params.startTs != null) {
    clauses.push("t >= ?");
    args.push(params.startTs);
  }
  if (params.endTs != null) {
    clauses.push("t <= ?");
    args.push(params.endTs);
  }
  if (params.session) {
    clauses.push("session = ?");
    args.push(params.session);
  }
  return db
    .prepare(
      `SELECT symbol, resolution, session, t, o, h, l, c, v, source
       FROM candles WHERE ${clauses.join(" AND ")} ORDER BY t ASC`
    )
    .all(...args) as unknown as DuxCandle[];
}

export function candleStats(): { symbol: string; resolution: string; bars: number; first_t: number; last_t: number }[] {
  return getDuxDb()
    .prepare(
      `SELECT symbol, resolution, COUNT(*) AS bars, MIN(t) AS first_t, MAX(t) AS last_t
       FROM candles GROUP BY symbol, resolution ORDER BY symbol, resolution`
    )
    .all() as unknown as { symbol: string; resolution: string; bars: number; first_t: number; last_t: number }[];
}

export function getSymbolMeta(symbol: string, db = getDuxDb()): DuxSymbolMeta | null {
  const row = db
    .prepare(
      `SELECT symbol, float_shares, mcap_usd, sector, is_biotech, is_energy, is_china_adr, as_of, source
       FROM symbols WHERE symbol = ?`
    )
    .get(symbol) as
    | {
        symbol: string;
        float_shares: number | null;
        mcap_usd: number | null;
        sector: string | null;
        is_biotech: number;
        is_energy: number;
        is_china_adr: number;
        as_of: number | null;
        source: string;
      }
    | undefined;
  if (!row) return null;
  return {
    symbol: row.symbol,
    floatShares: row.float_shares,
    mcapUsd: row.mcap_usd,
    sector: row.sector,
    isBiotech: Boolean(row.is_biotech),
    isEnergy: Boolean(row.is_energy),
    isChinaAdr: Boolean(row.is_china_adr),
    asOf: row.as_of,
    source: row.source,
  };
}

export function upsertSymbolMeta(meta: DuxSymbolMeta, db = getDuxDb()): void {
  db.prepare(
    `INSERT INTO symbols (symbol, float_shares, mcap_usd, sector, is_biotech, is_energy, is_china_adr, as_of, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET
       float_shares=excluded.float_shares,
       mcap_usd=excluded.mcap_usd,
       sector=excluded.sector,
       is_biotech=excluded.is_biotech,
       is_energy=excluded.is_energy,
       is_china_adr=excluded.is_china_adr,
       as_of=excluded.as_of,
       source=excluded.source`
  ).run(
    meta.symbol,
    meta.floatShares,
    meta.mcapUsd,
    meta.sector,
    meta.isBiotech ? 1 : 0,
    meta.isEnergy ? 1 : 0,
    meta.isChinaAdr ? 1 : 0,
    meta.asOf,
    meta.source
  );
}

export function logIngest(entry: Omit<DuxIngestLogRow, "id">, db = getDuxDb()): void {
  db.prepare(
    `INSERT INTO ingest_log (symbol, resolution, start_date, end_date, bars, status, message, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.symbol,
    entry.resolution,
    entry.startDate,
    entry.endDate,
    entry.bars,
    entry.status,
    entry.message,
    entry.at
  );
}

export function recentIngestLogs(limit = 20): DuxIngestLogRow[] {
  return getDuxDb()
    .prepare(`SELECT * FROM ingest_log ORDER BY id DESC LIMIT ?`)
    .all(limit) as unknown as DuxIngestLogRow[];
}

export function makeCandle(input: {
  symbol: string;
  resolution: "1m" | "1d";
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  source?: string;
}): DuxCandle {
  return {
    symbol: input.symbol,
    resolution: input.resolution,
    session: input.resolution === "1d" ? "rth" : classifyUsSession(input.t),
    t: input.t,
    o: input.o,
    h: input.h,
    l: input.l,
    c: input.c,
    v: input.v,
    source: input.source ?? "futu",
  };
}

export function fixturesDir(): string {
  return path.join(process.cwd(), "docs", "dux", "fixtures");
}
