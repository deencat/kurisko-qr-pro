import type { DatabaseSync } from "node:sqlite";
import { getDuxDb } from "../store";
import type { Trade } from "../backtest/types";
import type { PaperMode, PaperOrder } from "./types";

export function ensurePaperSchema(db = getDuxDb()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS paper_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      mode TEXT NOT NULL,
      params_json TEXT NOT NULL,
      equity REAL NOT NULL,
      status TEXT NOT NULL,
      summary_json TEXT
    );
    CREATE TABLE IF NOT EXISTS paper_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      t INTEGER NOT NULL,
      side TEXT NOT NULL,
      shares REAL NOT NULL,
      price REAL NOT NULL,
      reason TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'paper',
      FOREIGN KEY(run_id) REFERENCES paper_runs(id)
    );
    CREATE TABLE IF NOT EXISTS paper_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      entry_ts INTEGER NOT NULL,
      exit_ts INTEGER NOT NULL,
      shares REAL NOT NULL,
      avg_entry REAL NOT NULL,
      avg_exit REAL NOT NULL,
      pnl REAL NOT NULL,
      exit_reason TEXT NOT NULL,
      legs_json TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES paper_runs(id)
    );
  `);
}

export function insertPaperRun(
  input: {
    mode: PaperMode;
    paramsJson: string;
    equity: number;
    status: string;
    summaryJson: string | null;
    startedAt: number;
    finishedAt: number;
  },
  db: DatabaseSync = getDuxDb()
): number {
  ensurePaperSchema(db);
  const r = db
    .prepare(
      `INSERT INTO paper_runs (started_at, finished_at, mode, params_json, equity, status, summary_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.startedAt,
      input.finishedAt,
      input.mode,
      input.paramsJson,
      input.equity,
      input.status,
      input.summaryJson
    );
  return Number(r.lastInsertRowid);
}

export function insertPaperOrders(runId: number, orders: PaperOrder[], db = getDuxDb()): void {
  ensurePaperSchema(db);
  const stmt = db.prepare(
    `INSERT INTO paper_orders (run_id, symbol, t, side, shares, price, reason, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'paper')`
  );
  db.exec("BEGIN");
  try {
    for (const o of orders) {
      stmt.run(runId, o.symbol, o.t, o.side, o.shares, o.price, o.reason);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function insertPaperTrades(runId: number, trades: Trade[], db = getDuxDb()): void {
  ensurePaperSchema(db);
  const stmt = db.prepare(
    `INSERT INTO paper_trades
      (run_id, symbol, entry_ts, exit_ts, shares, avg_entry, avg_exit, pnl, exit_reason, legs_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  db.exec("BEGIN");
  try {
    for (const t of trades) {
      stmt.run(
        runId,
        t.symbol,
        t.entryTs,
        t.exitTs,
        t.shares,
        t.avgEntry,
        t.avgExit,
        t.pnl,
        t.exitReason,
        JSON.stringify(t.legs)
      );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function recentPaperRuns(limit = 10, db = getDuxDb()) {
  ensurePaperSchema(db);
  return db
    .prepare(
      `SELECT id, started_at, finished_at, mode, equity, status, summary_json
       FROM paper_runs ORDER BY id DESC LIMIT ?`
    )
    .all(limit) as {
    id: number;
    started_at: number;
    finished_at: number | null;
    mode: string;
    equity: number;
    status: string;
    summary_json: string | null;
  }[];
}
