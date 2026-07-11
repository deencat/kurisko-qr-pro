# Kurisko QR Pro — VPS deployment architecture

Deploy the **slim app** on your VPS so TradingView webhooks arrive in **milliseconds**, not via a 5–15s poll from your laptop.

## Why VPS beats local + bridge

| Setup | TV alert latency | Complexity |
|-------|------------------|------------|
| Local METS + VPS poll bridge | 5–15 seconds | Medium |
| **Full slim app on VPS** | **~instant** (HTTP POST) | Low |
| Local + ngrok tunnel | ~instant while tunnel up | Fragile (URL changes, PC must stay on) |

## Architecture on VPS

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
└─────────────────┘                     └──────────────────────────────┘
         ▲                                         │
         │                                         ▼
         │                              https://your-domain/day-trade/qr-scanner
         │                              (you open in browser from anywhere)
```

**No bridge service needed** when the whole scanner runs on the VPS.

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
| Prisma / database | Scanner uses in-memory alerts |
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

## Next implementation step

Add `POST /api/kurisko/tradingview-webhook` to the slim app (included in METS-v1 PR path; run export after merge).
