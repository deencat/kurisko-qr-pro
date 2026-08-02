# Dux Phase 1 — Historical data (Futu → local store)

## Goal

Pull US equity **1m PM+RTH** (and daily) bars via Futu OpenD, persist under `data/dux/`, and read them from TypeScript for later backtests.

## Prerequisites

1. Install / start **FutuOpenD** (login with Futu ID).
2. US market quote rights enabled for your account.
3. Python 3.10+ with `futu-api` (`pip install -r scripts/dux/requirements.txt`).
4. Node 22+ recommended (`node:sqlite` built-in). `npm install` (includes `tsx`).

## Quota reminder

Futu **Historical Candlestick Quota** = distinct symbols pulled per rolling **7 days** (not “only 7 days of bars”). Persist locally so re-backtests do not re-burn quota.

## Commands

```bash
# Full Phase 1 self-test (fixtures + assertions + upsert idempotency)
npm run dux:test

# Import synthetic fixtures only
npm run dux:fixtures
npm run dux:status

# Futu OpenD history (use project venv)
python3 -m venv scripts/dux/.venv
scripts/dux/.venv/bin/pip install -r scripts/dux/requirements.txt
scripts/dux/.venv/bin/python scripts/dux/ingest_futu_history.py \
  --symbol US.AAPL --start 2024-01-02 --end 2024-01-03
# or: npm run dux:ingest -- --symbol US.AAPL --start 2024-01-02 --end 2024-01-03
```

### Verified (full Phase 1 retest 2026-08-02)

| Check | Result |
|-------|--------|
| `npm run dux:test` | PASS — allow/crowd/nano PM+rotation asserts + upsert idempotency |
| Fixture FIX_ALLOW / CROWDED / NANO | PASS — 720×1m bars each |
| Futu OpenD ingest `US.AAPL` 1m | PASS — 2880 bars (2024-01-02→01-03) when OpenD online |
| Store engine | Node built-in `node:sqlite` |

Env (optional):

```bash
export FUTU_OPEND_HOST=127.0.0.1
export FUTU_OPEND_PORT=11111
export DUX_DATA_DIR=./data/dux
```

## Layout

```
data/dux/
  kurisko_dux.db      # SQLite (gitignored via data/)
docs/dux/
  fixtures/           # synthetic JSON days for FIX_* tests (committed)
  GUS_PARAM_SCHEMA.md
  gus_smoke_seed.json
  PHASE1_DATA.md      # this file
src/lib/dux/
  config.ts
  types.ts
  store.ts            # Node built-in node:sqlite
  params.ts
  session.ts
scripts/dux/
  ingest_futu_history.py
  generate-fixtures.ts
  import-fixtures.ts
  store-status.ts
  requirements.txt
```
