# K1 event backtest MVP

Research-only bar-by-bar backtest for **K1 Quad Divergence** (Holy Grail). No live trading / order routing.

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
```

JSON runs land under `data/kurisko/runs/` (gitignored).

### Capital credentials

| Variable | Notes |
|----------|--------|
| `CAPITAL_API_KEY` | Required |
| `CAPITAL_IDENTIFIER` | Required |
| `CAPITAL_API_PASSWORD` | Kurisko name |
| `CAPITAL_PASSWORD` | Accepted alias (Liquidity) |
| `CAPITAL_DEMO` / `CAPITAL_ENV` | Demo by default |

Load order: process env → `./.env` → `../.env`. **Do not commit secrets.**

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
| `scripts/kurisko/capital-fetch.ts` | Script-safe Capital 1m pull |

## Gaps (not in MVP)

- No partials / TP2 opposite-rail breakout trail
- No news / session filters
- No tick-accurate stops (OHLC pathing: stop before TP on same bar)
- Channel mid locked at entry (not re-marked to live mid)
- Synthetic `--fixture` is wiring-only, not a realistic K1 tape
- Single-symbol CLI; no sweep / walk-forward yet

See also: [KURISKO_VIDEO_EXTRACT.md](./KURISKO_VIDEO_EXTRACT.md) (teaching extract) and `.documents/John_Kurisko_QuadRotation_Scalping_RAG.md` (quantified K1 table).
