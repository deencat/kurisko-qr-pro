# Kurisko QR Pro — Data layer design

> **Status:** Design approved for implementation (Phase 1+)  
> **Last updated:** 2026-07-20  
> **Related:** [PROJECT_PLAN.md](./PROJECT_PLAN.md) · [KURISKO_QR_VPS.md](./KURISKO_QR_VPS.md)

This document defines how Kurisko QR Pro stores market history, serves cached live scans, backfills gaps, and supports replay — without turning the slim VPS app into full METS-v1.

---

## 1. Goals and non-goals

### Goals

| Goal | Why it matters |
|------|----------------|
| **Survive restarts** | VPS reboots, Docker redeploys, and OOM kills must not wipe alerts or force cold-start Capital.com storms |
| **Incremental ingestion** | 60s scan loop should append new bars, not re-download multi-day windows every tick |
| **Deterministic replay** | Answer: *“What did K1 show on US500 at 10:32 ET yesterday?”* |
| **Gap recovery** | After downtime, detect missing bars and backfill automatically |
| **Keep VPS slim** | Single container, no Postgres cluster, minimal ops |

### Non-goals (stay in METS-v1)

- Full trade simulation / P&amp;L backtest UI
- Portfolio, walk-forward, research pipelines
- Multi-user auth beyond optional Clerk
- Tick-level or order-book storage

---

## 2. Current state (baseline)

The app already has a **server-side scan loop** and **read-only client feed**:

```
Capital.com ──► runKuriskoScan (60s) ──► scan-store (globalThis RAM)
                                              │
Browser ── GET /api/kurisko/scan ◄────────────┘
```

| Layer | Location | Lifetime | Contents |
|-------|----------|----------|----------|
| Live scan feed | `scan-store.ts` | Process | Latest snapshots, matrices, gap/premarket widgets |
| Alerts | `alert-store.ts` | Process | Last 80 K1 + TradingView alerts |
| Candle fetch cache | `market-data.ts` `sessionCache` | Process | Full window refetch keyed by `(symbol, resolution, start, end)` |
| Fear &amp; Greed | `fear-greed/route.ts` | Process, 15 min | External index |
| Client UI | React state | Tab session | Polls GET endpoints every 60s |

**Gaps today:**

1. `fetchCapitalCandlesDelta` exists but is **never used** — every scan refetches via `fetchAllCapitalCandles`.
2. Snapshot lookback is only **2 days** (`SNAPSHOT_LOOKBACK_DAYS`); levels use up to **60 days** daily — inconsistent and re-fetched.
3. **No disk persistence** — alerts and candles vanish on restart.
4. **No replay API** — `loadAzizMarketData({ endTs })` and `diagnoseK1*` support historical analysis in library code but are not exposed.
5. **No gap detection** after outages.

---

## 3. Design principles

1. **Raw candles first** — persist OHLCV; derive snapshots on read or on a schedule.
2. **Write path = scheduler only** — clients never trigger Capital.com (already enforced for scan/matrix/levels).
3. **Idempotent ingestion** — upsert by `(symbol, resolution, bar_ts)`; safe to re-run backfill.
4. **Tiered retention** — hot RAM for latest feed, warm SQLite for candles/alerts, optional cold export.
5. **Replay = recompute** — store candles + alerts; re-run K1 diagnostics for arbitrary `at` timestamps rather than storing every intermediate snapshot (Phase 3 adds optional snapshot archive for speed).

---

## 4. Target architecture

```
                         ┌─────────────────────────────────────────┐
                         │           Kurisko QR Pro (VPS)          │
                         │                                         │
  TradingView webhook ──►│  alert-store ──► alert persistence      │
                         │       ▲                                 │
                         │       │ recordSnapshotTransition        │
  Capital.com REST ◄────►│  CandleStore ◄── delta + backfill       │
                         │       │                                 │
                         │       ▼                                 │
                         │  runKuriskoScan (scheduler 60s)         │
                         │       │                                 │
                         │       ▼                                 │
                         │  scan-store (hot RAM, latest feed)      │
                         └───────────────┬─────────────────────────┘
                                         │
              GET /scan, /alerts, /replay/at=…
                                         │
                                         ▼
                                   Browser clients
```

### 4.1 Storage choice: SQLite (warm tier)

**Why SQLite**

- Zero extra services on VPS (fits Docker Compose as-is)
- ACID upserts for candle deduplication
- Good enough for ~5 symbols × 1m bars × 90 days (&lt; 1M rows)
- Easy backup: copy `data/kurisko.db`

**Why not Postgres / Prisma (for now)**

- METS-v1 already owns heavy research DB patterns
- VPS ops cost and connection pooling add complexity
- Can migrate later if multi-instance or &gt;20 symbols

**File layout**

```
data/
  kurisko.db          # SQLite (gitignored)
  kurisko.db-wal      # WAL mode
  exports/            # optional CSV/JSON dumps (gitignored)
```

---

## 5. Data model

### 5.1 `candles`

Primary historical store.

| Column | Type | Notes |
|--------|------|-------|
| `symbol` | TEXT | e.g. `US500` |
| `resolution` | TEXT | `1m`, `5m`, `1d`, … |
| `t` | INTEGER | Bar open time (ms UTC) |
| `o`, `h`, `l`, `c` | REAL | OHLC mid |
| `v` | REAL | Volume (reported or synthetic) |
| `source` | TEXT | `capital` |
| `ingested_at` | INTEGER | Server write time |

**Primary key:** `(symbol, resolution, t)`

**Indexes:** `(symbol, resolution, t DESC)` for range queries and “latest bar”.

### 5.2 `ingestion_state`

Tracks cursor per series for delta fetch and backfill.

| Column | Type | Notes |
|--------|------|-------|
| `symbol`, `resolution` | TEXT | PK |
| `first_bar_ts` | INTEGER | Earliest stored bar |
| `last_bar_ts` | INTEGER | Latest stored bar |
| `last_fetch_ts` | INTEGER | Last successful API pull |
| `last_gap_scan_ts` | INTEGER | Last gap check |
| `status` | TEXT | `ok` \| `gap` \| `backfilling` \| `error` |
| `error_message` | TEXT | nullable |

### 5.3 `alerts`

Append-only event log (K1 transitions + TradingView).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | PK |
| `source` | TEXT | `k1` \| `tradingview` |
| `symbol` | TEXT | |
| `ts` | INTEGER | Event time |
| `payload` | JSON | Full `KuriskoAlert` |

**Retention:** 90 days default (configurable); prune via nightly job.

### 5.4 `snapshots` (optional, Phase 3b)

Periodic scan artifacts for fast replay without recomputing indicators.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | `{symbol}-{bar_ts}-{scanned_at}` |
| `symbol` | TEXT | |
| `bar_ts` | INTEGER | Execution bar the snapshot refers to |
| `scanned_at` | INTEGER | When scheduler produced it |
| `stage` | TEXT | K1 stage at scan time |
| `payload` | JSON | Full `KuriskoSnapshot` (compressed if large) |

**Write policy:** one row per symbol per scan tick (5 rows/min at 60s interval ≈ 7k rows/day — acceptable).

### 5.5 Hot tier (unchanged)

`scan-store` remains the **authoritative latest feed** for UI latency. SQLite is source of truth for history; RAM is source of truth for *now*.

---

## 6. Ingestion and backfill

### 6.1 Live delta path (every scan tick)

For each default symbol + required resolutions (`1m` for K1, `1d` for levels):

```
1. Read ingestion_state.last_bar_ts
2. If missing → seed backfill (§6.2)
3. Else → fetchCapitalCandlesDelta(after=last_bar_ts, end=now)
4. Upsert new bars into candles
5. Update ingestion_state
6. buildKuriskoSnapshot reads from CandleStore.getRange(), not direct Capital fetch
```

**Fallback:** if delta returns 0 bars but `now - last_bar_ts > 2 × bar_period`, mark `gap` and trigger backfill.

### 6.2 Seed / deep backfill

Triggered on:

- First boot (empty DB)
- Manual `POST /api/kurisko/admin/backfill` (CRON_SECRET)
- Gap detector (scheduler every N ticks)

```
1. Compute target window from retention policy (§7)
2. fetchAllCapitalCandles(start, end) with pagination (existing client)
3. Upsert all bars
4. Merge contiguous ranges; update first_bar_ts / last_bar_ts
```

**Rate limiting:** reuse existing 120ms inter-page delay; serialize symbols (already 1.2s apart in scan loop).

### 6.3 Gap detection

After each successful delta:

```
expected_latest = floor(now / bar_ms) * bar_ms - bar_ms
if last_bar_ts < expected_latest - MAX_GAP_BARS * bar_ms:
  status = 'gap'
  enqueue backfill for [last_bar_ts, expected_latest]
```

`MAX_GAP_BARS` default: 5 (configurable).

### 6.4 Module layout (implementation)

```
src/lib/kurisko/data/
  candle-store.ts       # SQLite access, upsert, range queries
  ingestion.ts          # delta + backfill orchestration
  retention.ts          # prune old bars/alerts
  replay.ts             # point-in-time K1 recompute
  types.ts
```

Refactor `loadAzizMarketData` to:

```ts
loadAzizMarketData(params) {
  if (CANDLE_STORE_ENABLED) return candleStore.load(params);
  return legacyCapitalFetch(params);  // feature flag fallback
}
```

---

## 7. Retention policy

| Series | Resolution | Default retention | Used by |
|--------|------------|-------------------|---------|
| K1 execution | `1m` | 30 days | Snapshot, matrix |
| Structure (aggregated) | `5m` | 30 days | Derived from 1m or stored |
| Key levels | `1d` | 400 days | Pivots, ATH fib |
| Alerts | — | 90 days | Sidebar, audio |
| Snapshots (optional) | — | 14 days | Fast replay |

Env overrides (planned):

```env
KURISKO_DATA_DIR=./data
KURISKO_CANDLE_RETENTION_DAYS_1M=30
KURISKO_CANDLE_RETENTION_DAYS_1D=400
KURISKO_ALERT_RETENTION_DAYS=90
KURISKO_SNAPSHOT_RETENTION_DAYS=14
```

Nightly prune job (scheduler hook or cron) deletes rows older than policy.

---

## 8. Replay

### 8.1 Replay modes

| Mode | API (planned) | Description |
|------|---------------|-------------|
| **Point-in-time K1** | `GET /api/kurisko/replay?symbol=US500&at=2026-07-19T14:32:00Z` | Load candles ≤ `at`, run `diagnoseK1LatestBar` + stage resolution |
| **Alert history** | `GET /api/kurisko/alerts?since=&until=` | Query persisted alerts (extends current in-memory GET) |
| **Scan timeline** | `GET /api/kurisko/replay/scan?symbol=US500&from=&to=` | Return stored snapshots or recompute per minute |
| **Session export** | `GET /api/kurisko/replay/export?date=2026-07-19` | JSON bundle for offline review |

### 8.2 Replay semantics

- **`at`** is inclusive of the last fully closed bar ≤ timestamp (never partial bar unless `includePartial=true`).
- **Timezone:** store UTC; UI converts to ET for display (existing format helpers).
- **Warmup:** require 80+ execution bars before K1 gates (existing `diagnoseK1LatestBar` rule).
- **Data source label:** replay responses include `dataSource: "store" | "capital"` and `coverage: { firstBarTs, lastBarTs, barCount }` so clients know if history is incomplete.

### 8.3 Caching replay results

Short TTL in-memory cache keyed by `(symbol, at, timeframePairId)` — 5 min — to avoid repeated indicator work when scrubbing UI.

---

## 9. API changes (planned)

| Endpoint | Change |
|----------|--------|
| `GET /api/kurisko/scan` | Unchanged contract; fed by store-backed scan |
| `GET /api/kurisko/alerts` | Merge RAM + DB; `?since=` / `?until=` filters |
| `GET /api/kurisko/replay` | **New** — point-in-time snapshot |
| `GET /api/kurisko/replay/scan` | **New** — timeline |
| `POST /api/kurisko/admin/backfill` | **New** — CRON_SECRET protected |
| `GET /api/kurisko/admin/data-status` | **New** — ingestion health per symbol |

All admin routes reuse `cron-auth.ts` (`CRON_SECRET`).

---

## 10. Docker and operations

### 10.1 Volume mount

```yaml
# docker-compose.yml (planned)
services:
  qr-scanner:
    volumes:
      - ./data:/app/data
```

### 10.2 Backup

```bash
# Daily cron on VPS
sqlite3 data/kurisko.db ".backup data/backups/kurisko-$(date +%F).db"
find data/backups -mtime +14 -delete
```

### 10.3 Health checks

`GET /api/kurisko/admin/data-status` returns:

```json
{
  "storeEnabled": true,
  "symbols": {
    "US500": {
      "1m": { "lastBarTs": 1721387520000, "barCount": 43200, "status": "ok", "lagBars": 0 },
      "1d": { "lastBarTs": 1721347200000, "barCount": 400, "status": "ok" }
    }
  },
  "alertsCount": 1240,
  "diskBytes": 8388608
}
```

---

## 11. Failure modes

| Failure | Behavior |
|---------|----------|
| Capital.com down | Serve last scan-store feed; mark `stale: true`; retry ingestion with backoff |
| SQLite locked / corrupt | Fall back to legacy Capital fetch; log error; optional auto-rebuild from backfill |
| Disk full | Prune aggressively; disable snapshot archive; alert in data-status |
| Long outage | Gap detector backfills on recovery; replay may show `coverage.historyShortfall: true` until complete |

---

## 12. Testing strategy

| Test | Scope |
|------|-------|
| Unit | Candle upsert dedup, gap detection, retention prune |
| Integration | Mock Capital pagination → store → buildKuriskoSnapshot |
| Replay golden | Fixed candle fixture → known K1 stage at bar index |
| Restart | Kill process, restart, verify alerts + candles persist |

---

## 13. Migration from current deploy

1. Ship with `KURISKO_CANDLE_STORE_ENABLED=false` (default off for one release).
2. Enable on VPS; first boot runs seed backfill (~2–5 min for 5 symbols).
3. Verify `data-status` shows `ok` for all series.
4. Flip default to `true` in following release.

No breaking changes to existing GET `/scan` response shape.

---

## 14. Open questions

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | Store 5m natively or aggregate from 1m? | Aggregate from 1m initially; store 5m only if profiling shows CPU cost |
| 2 | Snapshot archive vs recompute-only replay? | Start recompute-only; add snapshot table if replay &gt; 500ms |
| 3 | better-sqlite3 vs sql.js? | `better-sqlite3` for server performance; native dep in Docker is fine |
| 4 | Multi-VPS replicas? | Out of scope; would need Postgres + shared store |

---

## 15. References

- `src/lib/kurisko/snapshot/scan-store.ts` — hot feed
- `src/lib/kurisko/snapshot/scan-scheduler.ts` — 60s loop
- `src/lib/aziz/improvement/market-data.ts` — current fetch + session cache
- `src/lib/capital/client.ts` — `fetchAllCapitalCandles`, `fetchCapitalCandlesDelta`
- `src/lib/kurisko/backtest/k1-diagnose.ts` — replay computation engine
