import type { DatabaseSync } from "node:sqlite";
import { getDuxDb } from "../store";
import type { LiveConfig, LiveTicket } from "./types";

export function ensureLiveSchema(db = getDuxDb()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS live_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      broker TEXT NOT NULL,
      trd_env TEXT NOT NULL,
      armed INTEGER NOT NULL,
      status TEXT NOT NULL,
      summary_json TEXT
    );
    CREATE TABLE IF NOT EXISTS live_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      t INTEGER NOT NULL,
      side TEXT NOT NULL,
      intent_shares REAL NOT NULL,
      clamped_shares REAL NOT NULL,
      price REAL NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      max_sell_short REAL,
      broker_order_id TEXT,
      broker_msg TEXT,
      FOREIGN KEY(run_id) REFERENCES live_runs(id)
    );
  `);
}

export function insertLiveRun(
  input: {
    broker: string;
    trdEnv: string;
    armed: boolean;
    status: string;
    summaryJson: string;
    startedAt: number;
    finishedAt: number;
  },
  db: DatabaseSync = getDuxDb()
): number {
  ensureLiveSchema(db);
  const r = db
    .prepare(
      `INSERT INTO live_runs (started_at, finished_at, broker, trd_env, armed, status, summary_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.startedAt,
      input.finishedAt,
      input.broker,
      input.trdEnv,
      input.armed ? 1 : 0,
      input.status,
      input.summaryJson
    );
  return Number(r.lastInsertRowid);
}

export function insertLiveTickets(runId: number, tickets: LiveTicket[], db = getDuxDb()): void {
  ensureLiveSchema(db);
  const stmt = db.prepare(
    `INSERT INTO live_orders
      (run_id, symbol, t, side, intent_shares, clamped_shares, price, reason, status, max_sell_short, broker_order_id, broker_msg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  db.exec("BEGIN");
  try {
    for (const t of tickets) {
      stmt.run(
        runId,
        t.intent.symbol,
        t.intent.t,
        t.intent.side,
        t.intent.shares,
        t.clampedShares,
        t.intent.price,
        t.intent.reason,
        t.status,
        t.maxSellShort,
        t.brokerOrderId,
        t.brokerMsg
      );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function recentLiveRuns(limit = 10, db = getDuxDb()) {
  ensureLiveSchema(db);
  return db
    .prepare(
      `SELECT id, started_at, finished_at, broker, trd_env, armed, status, summary_json
       FROM live_runs ORDER BY id DESC LIMIT ?`
    )
    .all(limit) as {
    id: number;
    started_at: number;
    finished_at: number | null;
    broker: string;
    trd_env: string;
    armed: number;
    status: string;
    summary_json: string | null;
  }[];
}
