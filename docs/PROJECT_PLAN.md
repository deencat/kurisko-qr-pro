# Kurisko QR Pro — Project plan

Roadmap for the slim VPS scanner. Updated to include **data persistence, backfill, and replay**.

**Design detail:** [KURISKO_DATA_PERSISTENCE.md](./KURISKO_DATA_PERSISTENCE.md)  
**Deployment:** [KURISKO_QR_VPS.md](./KURISKO_QR_VPS.md)

---

## Status overview

| Area | Status | Notes |
|------|--------|-------|
| Live K1 scan + scheduler | Done | 60s tick, in-memory cache |
| TradingView webhook | Done | Instant alerts on VPS |
| Gap / premarket / levels widgets | Done | Cached in RAM per tick |
| Data persistence | **Done** | SQLite candles, snapshots, alerts, replay API + UI |
| Replay API + UI | **Done** | Phases 3–4 |
| METS backtest port | Out of scope | Stays in METS-v1 |

---

## Phase 0 — Baseline (complete)

**Goal:** Production-ready live scanner on VPS.

- [x] Export slim app from METS-v1
- [x] Docker + env-based Capital.com config
- [x] In-process scan scheduler (`instrumentation.ts`)
- [x] `GET /api/kurisko/scan` read-only feed
- [x] QR Pro UI with live charts, matrix, alerts
- [x] TradingView webhook route

**Deliverable:** Deployable scanner with ephemeral cache only.

---

## Phase 1 — Candle store & incremental backfill

**Status:** Done

**Goal:** Durable OHLCV locally; reduce Capital API usage; survive restarts for chart data.

**Duration estimate:** 3–5 days

### Tasks

1. **SQLite foundation**
   - Add `better-sqlite3` dependency
   - `src/lib/kurisko/data/db.ts` — connect, WAL, migrations
   - `schema.sql` — `candles`, `candle_watermarks` tables
   - Unit tests for upsert + range query

2. **CandleStore module**
   - `upsert(candles)`, `range(symbol, resolution, from, to)`
   - `getWatermark` / `setWatermark`
   - `prune(beforeTs)` by retention config

3. **BackfillService**
   - Cold: `fetchAllCapitalCandles` for retention window
   - Warm: wire `fetchCapitalCandlesDelta` (currently unused)
   - Gap detection using existing `historyShortfall` logic

4. **Local-first market data**
   - Extend `loadAzizMarketData` to read CandleStore first
   - Write-through after Capital fetch
   - Respect `KURISKO_DATA_ENABLED` flag

5. **Startup hook**
   - `hydrateKuriskoData()` from `instrumentation.ts`
   - Run backfill when `KURISKO_BACKFILL_ON_START=true`

6. **Infrastructure**
   - `docker-compose.yml`: volume `./data:/app/data`
   - `.env.example`: data env vars
   - `GET /api/kurisko/history/status` (candles section only)

### Acceptance criteria

- [x] After restart, 1m candles for US500 load from disk without full API backfill
- [x] Scan tick performs delta fetch (observable in logs / status endpoint)
- [x] `KURISKO_DATA_ENABLED=false` skips all DB I/O
- [x] DB file lives on mounted volume

### Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Capital rate limits on cold backfill | Serialize symbols; reuse delays; cap pages |
| SQLite lock contention | Single writer process; WAL mode |
| Docker permission on `./data` | Document `chown` in VPS doc |

---

## Phase 2 — Snapshot & alert persistence

**Status:** Done

**Goal:** Store every scan run and alert for historical query and restart hydration.

**Duration estimate:** 2–4 days  
**Depends on:** Phase 1

### Tasks

1. **Schema extension**
   - `scan_runs`, `snapshots`, `matrices`, `alerts` tables

2. **SnapshotStore**
   - `saveScanRun(result, matrices)` after each `runKuriskoScan`
   - `getLatestScanRun()`, `getScanRunAt(timestamp)`, `listScanRuns(from, to)`

3. **Alert persistence**
   - Append in `recordSnapshotTransition` and `recordTradingViewAlert`
   - Keep in-memory ring for hot reads; DB is source for history

4. **Hot cache hydration**
   - On startup, load latest `scan_run` into `scan-store` if age &lt; stale threshold

5. **Retention job**
   - `retention-service.ts` — prune old scan runs, alerts per env config
   - Run daily from scheduler

6. **Config**
   - `KURISKO_SNAPSHOT_PERSIST=true`
   - Retention day env vars

### Acceptance criteria

- [x] 24h of scan runs queryable after running overnight
- [x] Alerts survive container restart
- [x] Latest scan hydrates UI before first live tick completes
- [x] Prune removes data older than retention settings

---

## Phase 3 — Replay API

**Status:** Done

**Goal:** HTTP API for point-in-time and range replay without new UI yet.

**Duration estimate:** 2–3 days  
**Depends on:** Phase 2

### Tasks

1. **Routes**
   - `GET /api/kurisko/history/scan` — `?at=`, `?from=&to=&limit=`
   - `GET /api/kurisko/history/scan/[id]`
   - `GET /api/kurisko/history/alerts` — time + symbol filters
   - `GET /api/kurisko/history/candles` — local range (+ lazy backfill)
   - `POST /api/kurisko/history/backfill` — cron-auth manual repair

2. **Response contracts**
   - Document `replayMode`, `scannedAt`, `scanRunId` fields
   - Mirror `KuriskoScanFeed` shape for scan replay

3. **Status endpoint completion**
   - Full watermark, counts, `historyShortfall`, disk size

4. **Integration tests**
   - Seed DB fixture → replay at timestamp → assert stage/symbol

### Acceptance criteria

- [x] `curl /history/scan?at=...` returns consistent snapshot set
- [x] Chart candles for yesterday served from DB
- [x] Manual backfill endpoint fills gap when authorized

---

## Phase 4 — Replay UI

**Status:** Done

**Goal:** Operator can scrub time in QR Pro dashboard.

**Duration estimate:** 3–5 days  
**Depends on:** Phase 3

### Tasks

1. **Mode toggle:** Live | Replay on scanner page
2. **Time picker + “step” prev/next scan buttons**
3. **Wire replay endpoints to existing components** (`KuriskoScannerPage`, charts, matrix)
4. **Visual indicator** when viewing historical data (banner + timestamp)
5. **Optional:** `recompute` endpoint + “re-run K1 at this bar” dev tool

### Acceptance criteria

- [x] User selects past time → UI shows stored scanner state
- [x] Switch back to Live → resumes 60s polling
- [x] No Capital calls in replay mode (read from history only)

---

## Phase 5 — Ops & hardening

**Status:** Done

**Goal:** Production confidence on VPS.

**Duration estimate:** 1–2 days  
**Can parallelize** with phase 3–4

### Tasks

1. Backup runbook (copy `kurisko.db`, WAL checkpoint)
2. Log conventions: `[kurisko-data]` prefix
3. Health check: `/history/status` linked from deploy doc
4. Load test: 14 days retention at 5 symbols — verify disk & scan latency
5. Migration note: upgrading from in-memory-only deployments

### Acceptance criteria

- [x] Documented backup/restore in `KURISKO_QR_VPS.md`
- [x] Scan tick latency increase acceptable with persistence enabled
- [x] README links to all docs

---

## Implementation order (recommended)

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4
   │                       ▲
   └──── Phase 5 (ops) ─────┘
```

**MVP ship target:** Phases 1–3 (persist candles + scans + replay API).  
**User-facing replay:** Phase 4 when API is stable.

---

## File checklist (new / modified)

### New files

| Path | Phase |
|------|-------|
| `docs/KURISKO_DATA_PERSISTENCE.md` | Done |
| `docs/PROJECT_PLAN.md` | Done |
| `src/lib/kurisko/data/db.ts` | 1 |
| `src/lib/kurisko/data/schema.sql` | 1 |
| `src/lib/kurisko/data/candle-store.ts` | 1 |
| `src/lib/kurisko/data/backfill-service.ts` | 1 |
| `src/lib/kurisko/data/snapshot-store.ts` | 2 |
| `src/lib/kurisko/data/alert-store-persist.ts` | 2 |
| `src/lib/kurisko/data/retention-service.ts` | 2 |
| `src/lib/kurisko/data/hydrate.ts` | 1–2 |
| `src/app/api/kurisko/history/**/route.ts` | 1–3 |

### Modified files

| Path | Phase | Change |
|------|-------|--------|
| `src/lib/aziz/improvement/market-data.ts` | 1 | Local-first + write-through |
| `src/lib/kurisko/snapshot/run-scheduled-scan.ts` | 2 | Persist after scan |
| `src/lib/kurisko/snapshot/alert-store.ts` | 2 | Append to DB |
| `src/instrumentation.ts` | 1 | Startup hydrate |
| `docker-compose.yml` | 1 | Data volume |
| `.env.example` | 1 | Data config |
| `docs/KURISKO_QR_VPS.md` | 5 | Architecture + backup |
| `README.md` | 5 | Doc index |

---

## Environment variables (full list)

### Existing

```bash
CAPITAL_API_KEY=
CAPITAL_IDENTIFIER=
CAPITAL_API_PASSWORD=
CAPITAL_DEMO=true
FINNHUB_API_KEY=
CRON_SECRET=
KURISKO_SCAN_ENABLED=true
KURISKO_SCAN_INTERVAL_MS=60000
```

### Planned (persistence)

```bash
KURISKO_DATA_ENABLED=true
KURISKO_DATA_DIR=./data
KURISKO_CANDLE_RETENTION_DAYS=45
KURISKO_SNAPSHOT_RETENTION_DAYS=14
KURISKO_ALERT_RETENTION_DAYS=30
KURISKO_BACKFILL_ON_START=true
KURISKO_SNAPSHOT_PERSIST=true
KURISKO_CANDLE_BACKFILL_EVERY_TICK=true
KURISKO_SQLITE_WAL=true
```

---

## Success metrics

| Metric | Target |
|--------|--------|
| Capital candle API pages per scan tick | ≤ 2 per symbol (delta) |
| Time to usable charts after restart | &lt; 30 s (warm DB) |
| Scan feed availability after restart | Immediate (hydrated) |
| DB size (5 symbols, default retention) | &lt; 250 MB |
| Replay API latency | &lt; 200 ms |

---

## Out of scope (explicit)

- Postgres / multi-instance replication
- Full METS backtest engine in this repo
- Lighter.xyz or non-Capital data sources
- Real-time tick storage (1m bars sufficient for K1)
- Notion / external task sync

---

## Next action

All phases 1–5 implemented. Deploy with `docker compose up -d --build` and verify `/api/kurisko/history/status`.
