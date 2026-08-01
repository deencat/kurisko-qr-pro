import "server-only";

import type { CandleResolution, LighterCandle } from "@/lib/lighter/client";
import { getKuriskoDb } from "./db";

export interface CandleWatermark {
  symbol: string;
  resolution: string;
  earliestT: number | null;
  latestT: number | null;
  updatedAt: number;
}

export function upsertCandles(
  symbol: string,
  resolution: CandleResolution,
  candles: LighterCandle[]
): number {
  const db = getKuriskoDb();
  if (!db || candles.length === 0) return 0;

  const sym = symbol.toUpperCase();
  const insert = db.prepare(`
    INSERT INTO candles(symbol, resolution, t, o, h, l, c, v)
    VALUES(@symbol, @resolution, @t, @o, @h, @l, @c, @v)
    ON CONFLICT(symbol, resolution, t) DO UPDATE SET
      o = excluded.o, h = excluded.h, l = excluded.l, c = excluded.c, v = excluded.v
  `);

  const tx = db.transaction((rows: LighterCandle[]) => {
    for (const c of rows) {
      insert.run({
        symbol: sym,
        resolution,
        t: c.t,
        o: c.o,
        h: c.h,
        l: c.l,
        c: c.c,
        v: c.v ?? null,
      });
    }
  });

  tx(candles);
  updateWatermarkFromCandles(sym, resolution);
  return candles.length;
}

function updateWatermarkFromCandles(symbol: string, resolution: string): void {
  const db = getKuriskoDb();
  if (!db) return;

  const row = db
    .prepare(
      `SELECT MIN(t) AS earliest_t, MAX(t) AS latest_t, COUNT(*) AS cnt
       FROM candles WHERE symbol = ? AND resolution = ?`
    )
    .get(symbol, resolution) as { earliest_t: number | null; latest_t: number | null; cnt: number };

  if (!row?.cnt) return;

  db.prepare(
    `INSERT INTO candle_watermarks(symbol, resolution, earliest_t, latest_t, updated_at)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(symbol, resolution) DO UPDATE SET
       earliest_t = excluded.earliest_t,
       latest_t = excluded.latest_t,
       updated_at = excluded.updated_at`
  ).run(symbol, resolution, row.earliest_t, row.latest_t, Date.now());
}

export function getCandleRange(
  symbol: string,
  resolution: CandleResolution,
  fromTs: number,
  toTs: number
): LighterCandle[] {
  const db = getKuriskoDb();
  if (!db) return [];

  const rows = db
    .prepare(
      `SELECT t, o, h, l, c, v FROM candles
       WHERE symbol = ? AND resolution = ? AND t >= ? AND t <= ?
       ORDER BY t ASC`
    )
    .all(symbol.toUpperCase(), resolution, fromTs, toTs) as Array<{
    t: number;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number | null;
  }>;

  return rows.map((r) => ({
    t: r.t,
    o: r.o,
    h: r.h,
    l: r.l,
    c: r.c,
    v: r.v ?? 0,
  }));
}

export function getWatermark(symbol: string, resolution: CandleResolution): CandleWatermark | null {
  const db = getKuriskoDb();
  if (!db) return null;

  const row = db
    .prepare(
      `SELECT symbol, resolution, earliest_t, latest_t, updated_at
       FROM candle_watermarks WHERE symbol = ? AND resolution = ?`
    )
    .get(symbol.toUpperCase(), resolution) as
    | {
        symbol: string;
        resolution: string;
        earliest_t: number | null;
        latest_t: number | null;
        updated_at: number;
      }
    | undefined;

  if (!row) return null;

  return {
    symbol: row.symbol,
    resolution: row.resolution,
    earliestT: row.earliest_t,
    latestT: row.latest_t,
    updatedAt: row.updated_at,
  };
}

export function getAllWatermarks(): CandleWatermark[] {
  const db = getKuriskoDb();
  if (!db) return [];

  const rows = db
    .prepare(
      `SELECT symbol, resolution, earliest_t, latest_t, updated_at FROM candle_watermarks ORDER BY symbol, resolution`
    )
    .all() as Array<{
    symbol: string;
    resolution: string;
    earliest_t: number | null;
    latest_t: number | null;
    updated_at: number;
  }>;

  return rows.map((r) => ({
    symbol: r.symbol,
    resolution: r.resolution,
    earliestT: r.earliest_t,
    latestT: r.latest_t,
    updatedAt: r.updated_at,
  }));
}

export function pruneCandlesBefore(beforeTs: number): number {
  const db = getKuriskoDb();
  if (!db) return 0;

  const result = db.prepare("DELETE FROM candles WHERE t < ?").run(beforeTs);
  const symbols = db.prepare("SELECT DISTINCT symbol, resolution FROM candle_watermarks").all() as Array<{
    symbol: string;
    resolution: string;
  }>;

  for (const { symbol, resolution } of symbols) {
    updateWatermarkFromCandles(symbol, resolution);
  }

  return result.changes;
}

export function countCandles(symbol?: string): number {
  const db = getKuriskoDb();
  if (!db) return 0;

  if (symbol) {
    const row = db.prepare("SELECT COUNT(*) AS cnt FROM candles WHERE symbol = ?").get(symbol.toUpperCase()) as {
      cnt: number;
    };
    return row?.cnt ?? 0;
  }

  const row = db.prepare("SELECT COUNT(*) AS cnt FROM candles").get() as { cnt: number };
  return row?.cnt ?? 0;
}

export function getCandleCountsBySymbol(): Record<string, Record<string, number>> {
  const db = getKuriskoDb();
  if (!db) return {};

  const rows = db
    .prepare(
      `SELECT symbol, resolution, COUNT(*) AS cnt FROM candles GROUP BY symbol, resolution ORDER BY symbol, resolution`
    )
    .all() as Array<{ symbol: string; resolution: string; cnt: number }>;

  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    out[r.symbol] ??= {};
    out[r.symbol]![r.resolution] = r.cnt;
  }
  return out;
}
