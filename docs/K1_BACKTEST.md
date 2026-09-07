# K1 event backtest MVP

Research-only bar-by-bar backtest for **K1 Quad Divergence** (Holy Grail). No live trading / order routing.

## Deep Capital demo results (VIEW)

Period: **2026-06-09 → 2026-09-07** (~90 calendar days). Equity \$10k, risk 2%, cost 0.5 bps/side, time stop 20×1m. Capital demo 1m OHLC (synthetic volume).

| Symbol | Bars | Signals | Trades | Win% | PF | Net P&L | Max DD | Exits |
|--------|------|---------|--------|------|----|---------|--------|-------|
| GOLD | 87 770 | 56 | 56 | 50.0% | 0.91 | −394.20 | 560.90 | 25 stop / 24 tp_mid / 6 stoch_a / 1 time_stop |
| US500 | 89 992 | 7 | 7 | 57.1% | 1.54 | +40.75 | 75.46 | 3 stop / 3 stoch_a / 1 tp_mid |

### Funnel (stage counts over the window)

| Stage | GOLD | US500 |
|-------|------|-------|
| channelValidDown | 6 605 | 1 118 |
| atLowerRail | 2 141 | 361 |
| execQuadOs | 451 | 103 |
| bullishDiv | 222 | 29 |
| longSizingOk | 69 | 9 |
| channelValidUp | 6 497 | 1 339 |
| atUpperRail | 1 924 | 549 |
| execQuadOb | 415 | 154 |
| bearishDiv | 213 | 48 |
| shortSizingOk | 68 | 10 |

### Honest read

- **Not a performance claim.** Costs alone (−280 on GOLD) dominate; PF \< 1 on GOLD over this window.
- US500 sample is still thin (7 trades / ~3 months) — PF 1.54 is noise-scale, not edge proof.
- Strict K1 alignment stays rare: GOLD ~0.6 signals per day of 1m tape; US500 far scarcer.
- Funnel shows the pipe is alive (rails → quad → div → sizing), not a zero-trade wiring bug.
- Prior 4-day smoke (GOLD 4 trades, US500 1) was undersized; this multi-month pull is the better research baseline.

### Earlier smoke (kept for comparison)

| Symbol | Window | Bars | Trades | Win% | PF | Net P&L |
|--------|--------|------|--------|------|----|---------|
| GOLD | 2026-09-01 → 09-05 | 5 395 | 4 | 50% | 0.69 | −42.81 |
| US500 | 2026-09-01 → 09-05 | 5 490 | 1 | 100% | Inf | +15.06 |

## What it does

1. Builds dual-TF context (`1m` execution + `5m` structure) via existing `buildDualTfContext` / indicators.
2. On each 1m bar after warmup, runs `evaluateK1AtBar` (same criteria as `diagnoseK1` / SIGNAL `allPass`).
3. Enters at bar close when long or short **allPass**.
4. Exits (priority): **stop** under/over swing → **TP channel mid** → **STOCH_A** cross 80 (long) / 20 (short) → optional **time stop** (default 20 × 1m bars, RAG 15–20).
5. Applies a simple round-trip **spread/slip** placeholder (`costBpsPerSide`, default 0.5 bps/side).

## How to run

```bash
cd kurisko-qr-pro
npm install

# Unit tests for entry/exit helpers (offline)
npm run k1:test

# Offline smoke (synthetic candles — usually 0 SIGNAL trades; proves CLI wiring)
npm run k1:smoke

# Capital.com demo history (US500 or GOLD)
# Credentials: CAPITAL_API_KEY, CAPITAL_IDENTIFIER, and CAPITAL_API_PASSWORD
# Liquidity env also works: CAPITAL_PASSWORD (+ CAPITAL_ENV=demo)
npm run k1:backtest -- --symbol US500 --days 3
npm run k1:backtest -- --symbol GOLD --from 2026-09-01 --to 2026-09-03

# Multi-week / multi-month (deep paging + local cache under data/kurisko/capital/)
npm run k1:backtest -- --symbol GOLD --days 90 --max-pages 150
npm run k1:backtest -- --symbol US500 --days 90 --max-pages 150
# Re-run from cache: omit --no-cache (default). Fresh pull: --no-cache
# Skip funnel on huge tapes: --no-funnel
```

JSON runs land under `data/kurisko/runs/`; candle caches under `data/kurisko/capital/` (both gitignored via `/data/`).

### Capital credentials

| Variable | Notes |
|----------|--------|
| `CAPITAL_API_KEY` | Required |
| `CAPITAL_IDENTIFIER` | Required |
| `CAPITAL_API_PASSWORD` | Kurisko name |
| `CAPITAL_PASSWORD` | Accepted alias (Liquidity) |
| `CAPITAL_DEMO` / `CAPITAL_ENV` | Demo by default |

Load order: process env → `./.env` → `../.env`. **Do not commit secrets.**

### History depth (demo observed)

- Capital `MINUTE` pages return up to 1000 bars; this CLI pages backward (default `--max-pages 200`) with weekend/empty-window skips (Liquidity-style).
- GOLD/US500 1m demo returned ~88–90k bars for a 90-day window in Sep 2026; older months often still resolve (demo floor can reach ~2024 on some windows).
- Cache merge fills older/newer gaps so repeat runs stay offline once seeded.

## Interpreting output

- `signals` — bars where K1 `allPass` fired (before sizing/level rejection).
- `trades` / `winRate` / `profitFactor` / `netPnl` — closed trades after costs.
- `funnelSnippet` — gate counts from `diagnoseK1Funnel` (explains zero-trade windows).
- `byExitReason` — stop / tp_mid / stoch_a / time_stop / eod_flat.

Strict K1 alignment is rare; short demo windows often print **0 trades** even with valid Capital data. Use funnel counts to tune, not marketing claims from RAG/video.

## Code map

| Path | Role |
|------|------|
| `src/lib/kurisko/backtest/k1-diagnose.ts` | Criteria / `evaluateK1AtBar` |
| `src/lib/kurisko/backtest/k1-entry-exit.ts` | Stop / TP / stoch / time helpers |
| `src/lib/kurisko/backtest/k1-event-engine.ts` | Walk-forward engine |
| `src/lib/kurisko/backtest/k1-metrics.ts` | PF / win rate / DD |
| `scripts/kurisko/k1-backtest-run.ts` | CLI |
| `scripts/kurisko/capital-fetch.ts` | Script-safe Capital 1m pull + disk cache |

## Gaps (not in MVP)

- No partials / TP2 opposite-rail breakout trail
- No news / session filters
- No tick-accurate stops (OHLC pathing: stop before TP on same bar)
- Channel mid locked at entry (not re-marked to live mid)
- Synthetic `--fixture` is wiring-only, not a realistic K1 tape
- Single-symbol CLI; no sweep / walk-forward yet

See also: [KURISKO_VIDEO_EXTRACT.md](./KURISKO_VIDEO_EXTRACT.md) (teaching extract) and `.documents/John_Kurisko_QuadRotation_Scalping_RAG.md` (quantified K1 table).
