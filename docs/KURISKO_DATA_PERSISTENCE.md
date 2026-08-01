# Kurisko QR Pro — Data persistence, backfill & replay

Design for durable market data and scanner history on the VPS slim app. Complements live scanning without reintroducing the full METS backtest engine.

**Related:** [KURISKO_QR_VPS.md](./KURISKO_QR_VPS.md) · [PROJECT_PLAN.md](./PROJECT_PLAN.md)

---

## 1. Problem statement

Today the scanner is **live-only**:

| Data | Current behavior | Gap |
|------|------------------|-----|
| Capital.com candles | Fetched on every scan; `sessionCache` in RAM only | Lost on restart; redundant API calls |
| Scan results | Single latest snapshot in `scan-store` | No history; cannot answer “what was K1 at 10:32?” |
| Alerts | Ring buffer of 80 in `alert-store` | Lost on restart; no date-range query |
| Charts | Last ~90 bars embedded in current snapshot | No offline or historical chart window |

Goals:

1. **Persist** candles and scan outputs across restarts.
2. **Backfill** history incrementally (not full refetch every tick).
3. **Replay** cached scanner state and charts for a past time window.
4. Stay **VPS-simple**: one container, one file DB, no Postgres cluster.

Non-goals (stay in METS-v1):

- Full walk-forward backtest UI
- Paper/live trading
- Multi-user research workspace

---

## 2. Design principles

1. **Candles are source of truth; snapshots are derived.**  
   Store OHLCV once. K1 snapshots can be stored at scan time or recomputed later from candles (phase 4 optional).

2. **Hot path unchanged for clients.**  
   `GET /api/kurisko/scan` still reads in-memory cache first. Persistence is write-through + optional read-fallback.

3. **Incremental by default.**  
   Use `fetchCapitalCandlesDelta` for forward updates; full paginated backfill only on cold start or gap repair.

4. **Explicit retention.**  
   Configurable TTL for candles and snapshots so disk stays bounded on a small VPS.

5. **Graceful degradation.**  
   If DB is disabled or fails, scanner continues in current in-memory mode.

6. **Cron-gated writes.**  
   Manual backfill/repair via authenticated `POST` (same pattern as scan trigger).

---

## 3. Architecture

### 3.1 Current vs target

```
CURRENT (in-memory only)
────────────────────────
Capital.com ──► loadAzizMarketData (sessionCache)
                      │
                      ▼
              buildKuriskoSnapshot / runKuriskoScan
                      │
                      ▼
              scan-store + alert-store (RAM, lost on restart)


TARGET (persisted + live)
─────────────────────────
Capital.com ◄── delta / full backfill ──► CandleStore (SQLite)
                                                │
                    ┌───────────────────────────┘
                    ▼
            loadAzizMarketData (local-first, then API gap-fill)
                    │
                    ▼
            buildKuriskoSnapshot / runKuriskoScan
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  scan-store (hot)      SnapshotStore + AlertStore (SQLite)
        │                       │
        └───────────┬───────────┘
                    ▼
            GET /scan (live)   GET /history/* (replay)
```

### 3.2 Storage choice: SQLite

| Criterion | SQLite | Postgres | Flat files |
|-----------|--------|----------|------------|
| VPS ops | One file + volume mount | Extra service | Simple but awkward queries |
| Replay by time | Indexed queries | Same | Slow |
| Write pattern | Single writer (OK for one Node process) | Overkill | Append-only logs |
| Backup | Copy `kurisko.db` | Dump | Many files |

**Decision:** SQLite with WAL mode, path `{KURISKO_DATA_DIR}/kurisko.db`.

Docker: mount `./data:/app/data`.

### 3.3 Data layers

#### Layer A — Candles (raw market data)

Purpose: reduce Capital.com API load; enable chart replay and optional K1 recompute.

```
candles(
  symbol      TEXT NOT NULL,
  resolution  TEXT NOT NULL,   -- '1m' primary; optional '5m' later
  t           INTEGER NOT NULL, -- bar open time ms UTC
  o,h,l,c     REAL NOT NULL,
  v           REAL,
  PRIMARY KEY (symbol, resolution, t)
)

candle_watermarks(
  symbol      TEXT NOT NULL,
  resolution  TEXT NOT NULL,
  earliest_t  INTEGER,          -- oldest bar we retain
  latest_t    INTEGER,          -- newest bar ingested
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (symbol, resolution)
)
```

Indexes: `(symbol, resolution, t DESC)` for range reads.

**Retention:** default 45 days of 1m bars for scan symbols (~65k bars/symbol). Prune job deletes `t < cutoff`.

#### Layer B — Scan runs & snapshots (derived scanner state)

Purpose: replay “what the dashboard showed” at a point in time without recomputing.

```
scan_runs(
  id           TEXT PRIMARY KEY,  -- uuid
  scanned_at   INTEGER NOT NULL,
  symbol_count INTEGER NOT NULL,
  buy_count    INTEGER NOT NULL,
  sell_count   INTEGER NOT NULL,
  errors_json  TEXT
)

snapshots(
  id                  TEXT PRIMARY KEY,
  scan_run_id         TEXT NOT NULL REFERENCES scan_runs(id),
  symbol              TEXT NOT NULL,
  scanned_at          INTEGER NOT NULL,
  bar_ts              INTEGER NOT NULL,
  timeframe_pair_id   TEXT NOT NULL,
  stage               TEXT NOT NULL,
  side                TEXT NOT NULL,
  price               REAL NOT NULL,
  payload_json        TEXT NOT NULL   -- full KuriskoSnapshot minus heavy dup fields
)

matrices(
  scan_run_id  TEXT NOT NULL,
  symbol       TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (scan_run_id, symbol)
)
```

**Retention:** default 14 days of scan runs (~20k snapshot rows at 5 symbols × 1440 scans/day). Older runs pruned.

**Payload strategy:** store full `KuriskoSnapshot` JSON (including `chartBars`) for faithful UI replay. Typical snapshot ~5–15 KB → ~100 MB for 14 days at 5 symbols (acceptable).

#### Layer C — Alerts (event log)

```
alerts(
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL,      -- 'k1' | 'tradingview'
  symbol      TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  timeframe   TEXT,
  side        TEXT NOT NULL,
  action      TEXT NOT NULL,
  from_stage  TEXT NOT NULL,
  to_stage    TEXT NOT NULL,
  message     TEXT NOT NULL,
  price       REAL NOT NULL,
  payload_json TEXT
)
```

Index: `(ts DESC)`, `(symbol, ts DESC)`.

**Retention:** default 30 days (alerts are small).

#### Layer D — Hot cache (unchanged)

Keep `scan-store.ts` and in-memory alert tail for sub-ms reads. On each successful scan:

1. Update hot cache (existing).
2. Append to SQLite (new, async or awaited in scheduler tick).

On startup:

1. Run candle backfill.
2. Hydrate hot cache from latest `scan_run` if present and fresh enough.

---

## 4. Backfill strategy

### 4.1 Cold start (no watermark)

For each symbol in `KURISKO_DEFAULT_SCAN_SYMBOLS`:

1. Compute `startTs = now - CANDLE_RETENTION_DAYS`.
2. Call `fetchAllCapitalCandles` (existing paginated backfill, max 30 pages).
3. Upsert into `candles`; set watermark `earliest_t`, `latest_t`.

Rate limit: reuse existing 120 ms delay between Capital pages; serialize symbols (same as scan loop).

### 4.2 Warm update (every scan tick or dedicated interval)

After live scan (or every N ticks):

1. Read watermark `latest_t` for `(symbol, 1m)`.
2. Call `fetchCapitalCandlesDelta(afterTimestamp: latest_t, endTimestamp: now)`.
3. Merge upserts; advance watermark.

**Note:** `fetchCapitalCandlesDelta` exists in `capital/client.ts` but is unused today — wire it in `market-data.ts` via a new `CandleStore` module.

### 4.3 Gap repair

If `historyShortfall` or local range has holes (missing minutes during market close is OK; intraday gaps are not):

1. Detect: expected bar count vs actual for session window.
2. Repair: targeted `fetchAllCapitalCandles` for gap window only.
3. Log repair events to `[kurisko-data]` for ops visibility.

### 4.4 Local-first read path

Update `loadAzizMarketData`:

```
1. If KURISKO_DATA_ENABLED:
     bars = CandleStore.range(symbol, resolution, startTs, endTs)
     if bars.length >= minBars and !historyShortfall:
       return AzizMarketData from local bars
2. Fetch from Capital (existing path)
3. If KURISKO_DATA_ENABLED:
     CandleStore.upsert(bars); update watermark
4. Return
```

This preserves current behavior when persistence is off.

### 4.5 Scheduling

| Job | When | Auth |
|-----|------|------|
| Candle delta backfill | Each scan tick (after symbols scanned) or every 60s | Internal |
| Full backfill | Startup if `KURISKO_BACKFILL_ON_START=true` | Internal |
| Manual backfill | `POST /api/kurisko/history/backfill` | `CRON_SECRET` |
| Retention prune | Daily (scheduler tick count or cron) | Internal |

---

## 5. Replay semantics

### 5.1 Snapshot replay (primary)

**Use case:** “Show me the scanner at 2026-07-20 14:32 UTC.”

```
GET /api/kurisko/history/scan?at=2026-07-20T14:32:00Z
GET /api/kurisko/history/scan?from=&to=&limit=
GET /api/kurisko/history/scan/:scanRunId
```

Response shape mirrors `KuriskoScanFeed` so the UI can reuse components in “replay mode”.

**Resolution rule:** return the scan_run with `scanned_at <= at` closest to `at` (floor). Document this in API responses as `replayMode: "snapshot"`.

### 5.2 Alert replay

```
GET /api/kurisko/history/alerts?from=&to=&symbol=&limit=
```

Superset of current `GET /api/kurisko/alerts` with time filters. Live endpoint keeps serving recent in-memory + DB tail.

### 5.3 Candle / chart replay

```
GET /api/kurisko/history/candles?symbol=US500&resolution=1m&from=&to=
```

Returns `KuriskoChartCandle[]` from local store. Triggers backfill if range extends before watermark (with cap).

UI: optional timeline scrubber drives `at` for snapshot + chart window.

### 5.4 Recompute replay (optional, phase 4)

**Use case:** Logic changed in METS; re-derive K1 at historical bar from stored candles.

```
GET /api/kurisko/history/recompute?symbol=&at=&timeframePairId=
```

Runs `buildKuriskoSnapshot` logic at bar index `i` where `bar.t <= at`. Heavier CPU; not required for MVP replay.

---

## 6. API surface (planned)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/kurisko/history/status` | Watermarks, row counts, disk size, last backfill |
| GET | `/api/kurisko/history/scan` | List or point-in-time scan replay |
| GET | `/api/kurisko/history/scan/[id]` | Full scan run by id |
| GET | `/api/kurisko/history/alerts` | Time-range alerts |
| GET | `/api/kurisko/history/candles` | Local candle range |
| POST | `/api/kurisko/history/backfill` | Cron: force backfill / repair |

Existing routes unchanged; persistence is additive.

---

## 7. Configuration

Add to `.env` (defaults shown):

```bash
# Persistence (off = current in-memory-only behavior)
KURISKO_DATA_ENABLED=true
KURISKO_DATA_DIR=./data

# Retention
KURISKO_CANDLE_RETENTION_DAYS=45
KURISKO_SNAPSHOT_RETENTION_DAYS=14
KURISKO_ALERT_RETENTION_DAYS=30

# Backfill
KURISKO_BACKFILL_ON_START=true
KURISKO_SNAPSHOT_PERSIST=true
KURISKO_CANDLE_BACKFILL_EVERY_TICK=true

# SQLite pragmas (optional)
KURISKO_SQLITE_WAL=true
```

---

## 8. Module layout (implementation)

```
src/lib/kurisko/data/
  db.ts                 # SQLite connection, migrations, WAL
  schema.sql            # Initial DDL
  candle-store.ts       # upsert, range, watermarks, prune
  snapshot-store.ts     # scan_runs, snapshots, matrices
  alert-store-persist.ts # append alerts, query by time
  backfill-service.ts   # cold/warm/gap repair orchestration
  retention-service.ts  # scheduled prune + vacuum
  hydrate.ts            # startup: backfill + hydrate hot cache

src/app/api/kurisko/history/
  status/route.ts
  scan/route.ts
  scan/[id]/route.ts
  alerts/route.ts
  candles/route.ts
  backfill/route.ts
```

Touch points on existing code:

- `loadAzizMarketData` — local-first read + write-through
- `run-scheduled-scan.ts` — persist scan run after `setCachedScan`
- `alert-store.ts` — append to DB on `recordSnapshotTransition` / TV webhook
- `instrumentation.ts` — call `hydrateKuriskoData()` on startup
- `docker-compose.yml` — volume mount `./data:/app/data`

**Dependency:** `better-sqlite3` (sync, fast, fine for single Node writer) or `libsql`/Turso if edge sync needed later. Recommend `better-sqlite3` for VPS.

---

## 9. Failure modes & ops

| Failure | Behavior |
|---------|----------|
| DB file missing | Create on startup if `KURISKO_DATA_ENABLED` |
| DB write error | Log; live scan continues; hot cache unaffected |
| Capital backfill fails | Serve partial local data; set `historyShortfall: true` in status |
| Disk full | Prune aggressively; expose `history/status` warning |
| Restore | Stop container; replace `data/kurisko.db`; restart backfill |

**Backup:** nightly copy of `data/kurisko.db` (cron on host or object storage). WAL checkpoint before copy.

**Monitoring:** `GET /api/kurisko/history/status` returns:

```json
{
  "enabled": true,
  "dbPath": "/app/data/kurisko.db",
  "dbSizeBytes": 124000000,
  "candles": { "US500": { "1m": { "earliest_t": 0, "latest_t": 0, "count": 0 } } },
  "scanRuns": { "count": 0, "oldestAt": null, "newestAt": null },
  "alerts": { "count": 0 },
  "lastBackfillAt": null,
  "historyShortfall": false
}
```

---

## 10. Security

- History APIs are **read-only** for scanner UI (same as current GET routes).
- `POST /history/backfill` requires `CRON_SECRET` (mirror `scan/route.ts`).
- No PII in stored payloads.
- Optional Clerk can gate `/day-trade/*` UI; API replay endpoints follow same middleware policy as other kurisko routes.

---

## 11. Capacity estimate (default 5 symbols)

| Item | Assumption | Size |
|------|------------|------|
| 1m candles | 45 days × 1440 × 5 symbols | ~325k rows, ~50 MB |
| Snapshots | 14 days × 1440 scans × 5 | ~100k rows, ~100 MB JSON |
| Alerts | 30 days, ~50/day | negligible |
| **Total** | | **~150–200 MB** |

Well within typical VPS disk; tune retention down if needed.

---

## 12. Relationship to METS-v1

| Concern | kurisko-qr-pro | METS-v1 |
|---------|----------------|---------|
| Live K1 scanner | Yes | Yes (full app) |
| Snapshot replay | This design | Could share export format |
| Walk-forward backtest | No | Yes |
| Shared code | `build-snapshot`, `k1-diagnose`, Capital client | Source of truth for logic |

When Kurisko logic changes in METS-v1, rsync as today. Optional future: export snapshot JSON schema version field for migration.

---

## 13. Open decisions

1. **Store matrices separately or inside snapshot payload?**  
   Recommendation: separate `matrices` table keyed by `scan_run_id` (matches current feed shape).

2. **Async vs sync DB writes on scan tick?**  
   Recommendation: await writes in scheduler (scan already ~seconds due to Capital); keeps replay consistent.

3. **UI replay in MVP?**  
   Recommendation: API first (phase 3); minimal “history status” admin panel optional; full scrubber phase 4.

4. **Levels / gap / premarket widgets?**  
   Recommendation: phase 2 optional JSON table `widget_cache(scan_run_id, kind, payload)` — lower priority than K1 snapshots.

---

## 14. Acceptance criteria (MVP = phases 1–3)

- [x] Restart container → candles and last scan available without waiting for full Capital refetch
- [x] Delta backfill adds new 1m bars each tick with ≤2 Capital pages per symbol
- [x] `GET /history/scan?at=` returns feed matching stored scan within 60s resolution
- [x] Alerts survive restart and are queryable by date range
- [x] `KURISKO_DATA_ENABLED=false` restores current in-memory-only behavior
- [x] Retention prune keeps DB under configured size bound
- [x] Docker volume documented; backup procedure in VPS doc
