# Kurisko QR Pro Scanner

Slim VPS deployment — John Kurisko K1 quad rotation dashboard (Capital.com).

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/KURISKO_QR_VPS.md](./docs/KURISKO_QR_VPS.md) | VPS deployment, webhooks, Docker |
| [docs/KURISKO_DATA_PERSISTENCE.md](./docs/KURISKO_DATA_PERSISTENCE.md) | **Design:** candle backfill, snapshot storage, replay |
| [docs/PROJECT_PLAN.md](./docs/PROJECT_PLAN.md) | **Roadmap:** phased implementation plan |

## Quick start

```bash
npm install
cp .env.example .env
npm run build && npm start
```

## Current vs planned data behavior

| Capability | Today |
|------------|-------|
| Live K1 scan | Yes (60s, in-memory cache) |
| Candles after restart | SQLite + incremental backfill |
| Scan history / replay | Snapshot store + replay API + UI |
| Alerts after restart | Persisted + queryable |

Persistence is enabled by default (`KURISKO_DATA_ENABLED=true`). Set `false` for legacy in-memory-only mode.
