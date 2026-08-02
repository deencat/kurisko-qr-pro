#!/usr/bin/env python3
"""Ingest US equity historical klines from Futu OpenD into data/dux/kurisko_dux.db."""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")


def classify_session(ts_ms: int) -> str:
    dt = datetime.fromtimestamp(ts_ms / 1000.0, tz=ET)
    if dt.weekday() >= 5:
        return "other"
    mins = dt.hour * 60 + dt.minute
    if 4 * 60 <= mins < 9 * 60 + 30:
        return "pm"
    if 9 * 60 + 30 <= mins < 16 * 60:
        return "rth"
    if 16 * 60 <= mins < 20 * 60:
        return "ah"
    return "other"


def parse_time_key(time_key: str) -> int:
    # Futu: "YYYY-MM-DD HH:MM:SS" in market local time (US ET for US stocks)
    dt = datetime.strptime(time_key, "%Y-%m-%d %H:%M:%S").replace(tzinfo=ET)
    return int(dt.timestamp() * 1000)


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
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
        CREATE INDEX IF NOT EXISTS idx_candles_sym_res_t ON candles(symbol, resolution, t);
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
        """
    )


def upsert_rows(conn: sqlite3.Connection, rows: list[tuple]) -> None:
    now = int(time.time() * 1000)
    conn.executemany(
        """
        INSERT INTO candles (symbol, resolution, session, t, o, h, l, c, v, source, ingested_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'futu', ?)
        ON CONFLICT(symbol, resolution, t) DO UPDATE SET
          session=excluded.session,
          o=excluded.o, h=excluded.h, l=excluded.l, c=excluded.c, v=excluded.v,
          source=excluded.source, ingested_at=excluded.ingested_at
        """,
        [(*r, now) for r in rows],
    )


def fetch_history(code: str, start: str, end: str, ktype, host: str, port: int):
    from futu import (
        AuType,
        KLType,
        OpenQuoteContext,
        RET_OK,
        Session,
    )

    # Prefer Session.ALL for US extended when available; fall back to extended_time.
    quote_ctx = OpenQuoteContext(host=host, port=port)
    all_rows = []
    page_req_key = None
    try:
        while True:
            kwargs = dict(
                code=code,
                start=start,
                end=end,
                ktype=ktype,
                autype=AuType.NONE,
                max_count=1000,
                page_req_key=page_req_key,
            )
            # Session.ALL ignores extended_time per Futu docs (OpenD >= 9.2.4207)
            try:
                kwargs["session"] = Session.ALL
            except Exception:
                kwargs["extended_time"] = True

            ret, data, page_req_key = quote_ctx.request_history_kline(**kwargs)
            if ret != RET_OK:
                raise RuntimeError(f"request_history_kline failed: {data}")
            if data is None or len(data) == 0:
                break
            all_rows.append(data)
            if page_req_key is None:
                break
        if not all_rows:
            return []
        import pandas as pd

        return pd.concat(all_rows, ignore_index=True)
    finally:
        quote_ctx.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest Futu US history into Dux SQLite store")
    parser.add_argument("--symbol", required=True, help="Futu code e.g. US.AAPL")
    parser.add_argument("--start", required=True, help="YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="YYYY-MM-DD")
    parser.add_argument("--resolution", choices=["1m", "1d"], default="1m")
    parser.add_argument("--host", default=os.environ.get("FUTU_OPEND_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("FUTU_OPEND_PORT", "11111")))
    parser.add_argument(
        "--db",
        default=os.environ.get(
            "DUX_DB_PATH",
            os.path.join(os.environ.get("DUX_DATA_DIR", "data/dux"), "kurisko_dux.db"),
        ),
    )
    args = parser.parse_args()

    try:
        from futu import KLType
    except ImportError:
        print("Install futu-api: pip install -r scripts/dux/requirements.txt", file=sys.stderr)
        return 1

    ktype = KLType.K_1M if args.resolution == "1m" else KLType.K_DAY
    os.makedirs(os.path.dirname(args.db) or ".", exist_ok=True)

    try:
        df = fetch_history(args.symbol, args.start, args.end, ktype, args.host, args.port)
    except Exception as exc:
        conn = sqlite3.connect(args.db)
        ensure_schema(conn)
        conn.execute(
            "INSERT INTO ingest_log (symbol, resolution, start_date, end_date, bars, status, message, at) VALUES (?,?,?,?,?,?,?,?)",
            (args.symbol, args.resolution, args.start, args.end, 0, "error", str(exc), int(time.time() * 1000)),
        )
        conn.commit()
        conn.close()
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    rows = []
    for _, r in df.iterrows():
        t = parse_time_key(str(r["time_key"]))
        sess = "rth" if args.resolution == "1d" else classify_session(t)
        rows.append(
            (
                args.symbol,
                args.resolution,
                sess,
                t,
                float(r["open"]),
                float(r["high"]),
                float(r["low"]),
                float(r["close"]),
                float(r["volume"] or 0),
            )
        )

    conn = sqlite3.connect(args.db)
    ensure_schema(conn)
    upsert_rows(conn, rows)
    conn.execute(
        "INSERT INTO ingest_log (symbol, resolution, start_date, end_date, bars, status, message, at) VALUES (?,?,?,?,?,?,?,?)",
        (
            args.symbol,
            args.resolution,
            args.start,
            args.end,
            len(rows),
            "ok",
            f"ingested {len(rows)} bars",
            int(time.time() * 1000),
        ),
    )
    conn.commit()
    conn.close()
    print(f"OK {args.symbol} {args.resolution} bars={len(rows)} -> {args.db}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
