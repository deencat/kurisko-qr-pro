# Kurisko QR Pro — VPS deployment architecture

Deploy the **slim app** on your VPS so TradingView webhooks arrive in **milliseconds**, not via a 5–15s poll from your laptop.

**See also:** [Data persistence & replay design](./KURISKO_DATA_PERSISTENCE.md) · [Project plan](./PROJECT_PLAN.md)

## Why VPS beats local + bridge

| Setup | TV alert latency | Complexity |
|-------|------------------|------------|
| Local METS + VPS poll bridge | 5–15 seconds | Medium |
| **Full slim app on VPS** | **~instant** (HTTP POST) | Low |
| Local + ngrok tunnel | ~instant while tunnel up | Fragile (URL changes, PC must stay on) |

## Architecture on VPS

### Live path (today)

```
┌─────────────────┐     HTTPS POST      ┌──────────────────────────────┐
│  TradingView    │ ──────────────────► │  VPS (kurisko-qr-pro)        │
│  CAPITALCOM:    │   /api/kurisko/     │  Next.js :3000               │
│  US500 alerts   │   tradingview-      │                              │
└─────────────────┘   webhook           │  ┌──────────┐ ┌───────────┐ │
                                        │  │ K1 scan  │ │ Live      │ │
┌─────────────────┐     REST            │  │ 60s poll │ │ Alerts    │ │
│  Capital.com    │ ◄────────────────── │  │ Capital  │ │ K1 + TV   │ │
│  demo API       │                     │  └──────────┘ └───────────┘ │
└─────────────────┘                     │         in-memory cache      │
                                        └──────────────────────────────┘
                                                    │
                                                    ▼
                              https://your-domain/day-trade/qr-scanner
```

**No bridge service needed** when the whole scanner runs on the VPS.

### Persistence path (implemented)

See [KURISKO_DATA_PERSISTENCE.md](./KURISKO_DATA_PERSISTENCE.md) for full design.

```
Capital.com ◄── delta backfill ──► SQLite (./data/kurisko.db)
                                        │
                    ┌───────────────────┤
                    ▼                   ▼
              live scan           GET /api/kurisko/history/*
              (hot cache)         replay snapshots & candles
```

Docker volume:

```yaml
volumes:
  - ./data:/app/data
```

## How to create the slim repo

### Option A — Export script (recommended)

From METS-v1:

```bash
chmod +x scripts/export-kurisko-slim.sh
./scripts/export-kurisko-slim.sh ../kurisko-qr-pro
cd ../kurisko-qr-pro
git init
git add .
git commit -m "Initial Kurisko QR Pro export from METS-v1"
git remote add origin git@github.com:YOU/kurisko-qr-pro.git
git push -u origin main
```

The script copies only:

- QR Pro UI (`src/features/kurisko/qr-pro/`)
- Kurisko libs + Capital.com client
- Minimal Aziz slice (market-data, SIP gap scan, Finnhub calendar)
- Kurisko API routes
- Docker + slim `package.json` (no Prisma, Lighter, research, METS backtest)

### Option B — New GitHub repo from template

1. Create empty repo `kurisko-qr-pro`
2. Run export script into that folder
3. Push

### Option C — Stay in METS-v1 on a slim branch

Same export, but delete unused `src/app/*` pages in-place on branch `kurisko-slim`. Harder to maintain alongside full METS.

**Recommendation:** **separate repo** (`kurisko-qr-pro`) for VPS; keep METS-v1 for research/backtest/Aziz.

## VPS setup (Ubuntu)

```bash
# On VPS
git clone git@github.com:YOU/kurisko-qr-pro.git
cd kurisko-qr-pro
cp .env.example .env   # edit CAPITAL_* keys
docker compose up -d --build
```

### HTTPS with Caddy (example)

```
qr.yourdomain.com {
  reverse_proxy localhost:3000
}
```

TradingView webhook URL:

```
https://qr.yourdomain.com/api/kurisko/tradingview-webhook?secret=YOUR_SECRET
```

## What was removed from METS-v1

| Removed | Why |
|---------|-----|
| Lighter.xyz integration | Kurisko VPS uses Capital only |
| METS backtest / paper / live | Not QR scanner |
| Aziz S1–S9 day-trade UI | Not Kurisko |
| Prisma / database (METS) | Replaced by SQLite candle/snapshot store — see [data design](./KURISKO_DATA_PERSISTENCE.md) |
| Research / astro-bazi | Unrelated |
| Worker / cron / self-improve | Unrelated |
| Portfolio / walk-forward | Unrelated |

## What stays

| Kept | Purpose |
|------|---------|
| K1 snapshot / scan / matrix / alerts | Core scanner |
| Gap + pre-market SIP (Capital movers) | Widgets |
| Fear & Greed + economic calendar | Widgets |
| Key levels API | Widgets |
| `lightweight-charts` | Live charts |
| Optional Clerk | Lock down non-scanner routes |

## TradingView + Capital.com bookmarks

Your TV symbols should match Capital epics:

| QR alias | Capital / TV |
|----------|----------------|
| ES | `CAPITALCOM:US500` |
| NQ | `CAPITALCOM:US100` |
| GC | `CAPITALCOM:GOLD` |
| BTC | `CAPITALCOM:BTCUSD` |
| YM | `CAPITALCOM:US30` |

## Syncing improvements from METS-v1

When you fix Kurisko logic in METS-v1:

```bash
# Re-export or rsync only kurisko paths
rsync -av ../METS-v1/src/lib/kurisko/ ./src/lib/kurisko/
rsync -av ../METS-v1/src/features/kurisko/ ./src/features/kurisko/
rsync -av ../METS-v1/src/app/api/kurisko/ ./src/app/api/kurisko/
```

## Data directory & backup

When persistence is enabled (`KURISKO_DATA_ENABLED=true`):

```bash
mkdir -p data
# docker-compose mounts ./data → /app/data
```

**Backup:** stop the container, copy `data/kurisko.db` (checkpoint WAL first if using WAL mode).  
**Restore:** replace the file and restart; delta backfill fills any gap since backup.

**Status check:** `GET /api/kurisko/history/status`

## Next implementation step

Kurisko persistence + replay are **done**. Next research work is **Dux GUS Phase 2** (event-driven backtest) — see [PROJECT_PLAN.md](./PROJECT_PLAN.md).

Dux history store (separate DB): `data/dux/kurisko_dux.db` — [dux/PHASE1_DATA.md](./dux/PHASE1_DATA.md).
