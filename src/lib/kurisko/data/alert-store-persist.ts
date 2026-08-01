import "server-only";

import type { KuriskoAlert } from "@/lib/kurisko/snapshot/types";
import { getKuriskoDb } from "./db";

export function persistAlert(alert: KuriskoAlert): void {
  const db = getKuriskoDb();
  if (!db) return;

  db.prepare(
    `INSERT INTO alerts(id, source, symbol, ts, timeframe, side, action, from_stage, to_stage, message, price, payload_json)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`
  ).run(
    alert.id,
    alert.source,
    alert.symbol,
    alert.ts,
    alert.timeframe,
    alert.side,
    alert.action,
    alert.fromStage,
    alert.toStage,
    alert.message,
    alert.price,
    JSON.stringify(alert)
  );
}

export function queryAlerts(options: {
  fromTs?: number;
  toTs?: number;
  symbol?: string;
  limit?: number;
}): KuriskoAlert[] {
  const db = getKuriskoDb();
  if (!db) return [];

  const limit = Math.min(200, Math.max(1, options.limit ?? 50));
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (options.fromTs != null) {
    clauses.push("ts >= ?");
    params.push(options.fromTs);
  }
  if (options.toTs != null) {
    clauses.push("ts <= ?");
    params.push(options.toTs);
  }
  if (options.symbol) {
    clauses.push("symbol = ?");
    params.push(options.symbol.toUpperCase());
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT payload_json FROM alerts ${where} ORDER BY ts DESC LIMIT ?`)
    .all(...params, limit) as Array<{ payload_json: string }>;

  return rows.map((r) => JSON.parse(r.payload_json) as KuriskoAlert);
}

export function countAlerts(): number {
  const db = getKuriskoDb();
  if (!db) return 0;
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM alerts").get() as { cnt: number };
  return row?.cnt ?? 0;
}

export function pruneAlertsBefore(beforeTs: number): number {
  const db = getKuriskoDb();
  if (!db) return 0;
  const result = db.prepare("DELETE FROM alerts WHERE ts < ?").run(beforeTs);
  return result.changes;
}

export function hydrateAlertsIntoMemory(limit = 80): KuriskoAlert[] {
  return queryAlerts({ limit });
}
