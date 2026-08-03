# Kurisko QR Pro Scanner

Slim VPS deployment — John Kurisko K1 quad rotation dashboard (Capital.com), plus a separate **Dux Gap-Up Short** research track (US equities / Futu).

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/KURISKO_QR_VPS.md](./docs/KURISKO_QR_VPS.md) | VPS deployment, webhooks, Docker |
| [docs/KURISKO_DATA_PERSISTENCE.md](./docs/KURISKO_DATA_PERSISTENCE.md) | Kurisko candle backfill, snapshot storage, replay |
| [docs/KURISKO_DATA_LAYER.md](./docs/KURISKO_DATA_LAYER.md) | Earlier data-layer notes (see also persistence doc) |
| [docs/PROJECT_PLAN.md](./docs/PROJECT_PLAN.md) | Roadmap: Kurisko + Dux GUS phases |
| [docs/dux/GUS_PARAM_SCHEMA.md](./docs/dux/GUS_PARAM_SCHEMA.md) | Dux Gap-Up Short param defs + search grids |
| [docs/dux/PHASE1_DATA.md](./docs/dux/PHASE1_DATA.md) | Futu history ingest → local SQLite store |
| [docs/dux/PHASE2_BACKTEST.md](./docs/dux/PHASE2_BACKTEST.md) | Event-driven GUS backtest + param sweeps |
| [docs/dux/PHASE3_PAPER.md](./docs/dux/PHASE3_PAPER.md) | Paper shadow fills + backtest parity |
| [docs/dux/PHASE4_LIVE.md](./docs/dux/PHASE4_LIVE.md) | Futu micro-live shorts (dry-run default) |

## Quick start

```bash
npm install
cp .env.example .env   # CAPITAL_* keys required
npm run build && npm start
```

Open `/day-trade/qr-scanner` (or `/kurisko-scanner`).

## Current Kurisko data behavior

| Capability | Today |
|------------|-------|
| Live K1 scan | Yes (60s, in-memory cache) |
| Candles after restart | SQLite + incremental backfill |
| Scan history / replay | Snapshot store + replay API + UI |
| Alerts after restart | Persisted + queryable |

Persistence is enabled by default (`KURISKO_DATA_ENABLED=true`). Set `false` for legacy in-memory-only mode.

## Dux GUS research (separate from Kurisko CFD)

```bash
npm install
npm run dux:test       # Phase 1 self-test (fixtures + asserts)
npm run dux:smoke      # Phase 2 GUS engine smoke on FIX_*
npm run dux:paper-smoke # Phase 3 paper parity
npm run dux:live-smoke  # Phase 4 gates + mock dry-run/submit
npm run dux:sweep -- --family gap_min
npm run dux:status

# Optional: live Futu OpenD history pull
python3 -m venv scripts/dux/.venv
scripts/dux/.venv/bin/pip install -r scripts/dux/requirements.txt
npm run dux:ingest -- --symbol US.AAPL --start 2024-01-02 --end 2024-01-03
```

## Architecture (current)

- **One server scan loop** polls Capital.com every 60s (`KURISKO_SCAN_INTERVAL_MS`)
- **Clients are read-only** — `GET /api/kurisko/scan` returns the cached feed (no per-browser Capital calls)
- **TradingView webhooks** append alerts instantly on the VPS
- **Historical persistence** — SQLite under `./data` (see persistence doc)

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

## Environment

See `.env.example`. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CAPITAL_*` | — | Capital.com API credentials |
| `CRON_SECRET` | — | Protects server-side scan/backfill triggers |
| `KURISKO_SCAN_ENABLED` | `true` | Enable in-process scheduler |
| `KURISKO_SCAN_INTERVAL_MS` | `60000` | Scan tick interval |
| `TV_WEBHOOK_SECRET` | — | TradingView webhook query secret |
| `KURISKO_DATA_ENABLED` | `true` | SQLite persistence for candles/snapshots/alerts |

## Repo

https://github.com/deencat/kurisko-qr-pro
