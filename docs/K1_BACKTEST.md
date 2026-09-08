# K1 event backtest MVP

Research-only bar-by-bar backtest for **K1 Quad Divergence** (Holy Grail). No live trading / order routing.

## Exit modes (VIEW)

CLI: `--exit-mode mvp|fast93|tp2_rail|fast93_tp2` (default **`mvp`**). Optional `--stoch-mid-exit` (soft cross of 50 on fast93 modes — video “sometimes only to 50”).

| Mode | Priority (stop always first) | Notes |
|------|------------------------------|-------|
| **mvp** | TP mid → STOCH_A **cross** 80/20 → time | Prior ~1y baseline. Cross-only 9,3. |
| **fast93** | STOCH_A into strength (**cross or already OB/OS**) → TP mid → time | More faithful video/RAG “exit into fast 9,3”; mandatory OB/OS exit. |
| **tp2_rail** | Opposite-rail **TP2** → STOCH_A → time | Skips mid (no partials). Mid sits between entry and opposite rail, so mid-then-rail never realizes TP2. |
| **fast93_tp2** | STOCH_A → opposite-rail TP2 → time | Stoch-first + rail hold. |

Stop / mid-or-rail / time always remain. K2/K3 diagnose engines (peer) keep their own stop/TP/stoch/time helpers in `k2-k3-entry-exit.ts`; shared mode flags are ready to reuse later.

## ~12-month exit-mode matrix (VIEW)

Period: **2025-09-07 → 2026-09-07** (~365d). Equity \$10k, risk 2%, cost 0.5 bps/side, time stop 20×1m. Same post-channel-fix Capital cache slice. **mvp** rows match the prior ~1y baseline exactly.

| Symbol | Mode | Bars | Trades | Win% | PF | Net P&L | Max DD | Exits |
|--------|------|------|--------|------|----|---------|--------|-------|
| GOLD | **mvp** (prior) | 353 302 | 273 | 45.4 | 0.76 | −3 284.76 | 3 379.53 | 135 stop / 93 tp_mid / 41 stoch_a / 4 time |
| GOLD | fast93 | 353 302 | 273 | 45.4 | **0.77** | **−3 193.36** | **3 292.37** | 135 stop / 80 tp_mid / 54 stoch_a / 4 time |
| GOLD | tp2_rail | 353 302 | 256 | 39.5 | 0.77 | −3 358.59 | 3 727.40 | 149 stop / 36 tp_rail / 64 stoch_a / 7 time |
| GOLD | fast93_tp2 | 353 302 | 256 | 39.8 | 0.77 | −3 347.77 | 3 691.08 | 149 stop / 24 tp_rail / 76 stoch_a / 7 time |
| US100 | **mvp** (prior) | 364 836 | 219 | 47.0 | 0.81 | −2 061.43 | 2 121.95 | 97 stop / 86 tp_mid / 33 stoch_a / 3 time |
| US100 | fast93 | 364 836 | 219 | 47.0 | **0.83** | **−1 960.02** | **2 020.53** | 97 stop / 71 tp_mid / 48 stoch_a / 3 time |
| US100 | tp2_rail | 364 836 | 203 | 45.3 | 0.80 | −2 125.08 | 2 211.08 | 106 stop / 32 tp_rail / 62 stoch_a / 3 time |
| US100 | fast93_tp2 | 364 836 | 203 | 45.3 | 0.82 | −2 026.06 | 2 112.06 | 106 stop / 22 tp_rail / 72 stoch_a / 3 time |

### Read vs prior ~1y (mvp)

- **fast93** is the only mode that improves both symbols on this tape (slightly less bad PF/net/DD). More exits via `stoch_a` (54 vs 41 GOLD; 48 vs 33 US100); still PF \< 1.
- **tp2_rail / fast93_tp2** cut trade count (~6–7%) and win rate; opposite-rail hits do print (`tp_rail`), but stops rise and net worsens vs mvp. Holding for the far rail without partials is not an unlock here.
- Not a performance claim — research comparison only.

## Deeper Capital history (VIEW)

Raised default `--max-pages` to **500**; deep probe uses **1000** (`DEEP_MAX_PAGES` / `npm run k1:deep-fetch`). Cache under `data/kurisko/capital/` (gitignored via `/data/`).

| Symbol | Cache bars | First → last (UTC) | Notes |
|--------|------------|--------------------|-------|
| GOLD | 713 000 | 2024-08-30 → 2026-09-07 | Extended +359 pages beyond prior ~12m |
| US100 | 728 000 | 2024-08-30 → 2026-09-07 | Extended +328 pages; demo not exhausted |

Full ~2y single-pass engine OOMs on this box (~15 GB RSS on 700k+ bars). Prefer **year slices** (below) or raise pages for fetch-only.

### Older year slice (2024-09-01 → 2025-09-07) vs prior ~1y

Same cost model / channel fix. Sparse vs recent year (fewer signals).

| Symbol | Mode | Bars | Trades | Win% | PF | Net P&L | Max DD | Exits |
|--------|------|------|--------|------|----|---------|--------|-------|
| GOLD | mvp | 359 555 | 124 | 53.2 | **1.11** | −348.47 | 646.26 | 48 stop / 52 tp_mid / 21 stoch_a / 3 time |
| GOLD | fast93 | 359 555 | 124 | 53.2 | **1.11** | −329.02 | 635.90 | 48 stop / 46 tp_mid / 27 stoch_a / 3 time |
| GOLD | tp2_rail | 359 555 | 118 | 48.3 | 1.01 | −563.90 | 868.68 | 58 stop / 15 tp_rail / 42 stoch_a / 3 time |
| US100 | mvp | 362 757 | 156 | 44.9 | **1.12** | −366.33 | 807.53 | 68 stop / 61 tp_mid / 27 stoch_a |
| US100 | fast93 | 362 757 | 156 | 44.9 | 1.09 | −439.77 | 829.22 | 68 stop / 49 tp_mid / 39 stoch_a |
| US100 | tp2_rail | 362 757 | 149 | 45.0 | **1.13** | −219.32 | 825.94 | 76 stop / 29 tp_rail / 43 stoch_a / 1 time |

Read: older year is **gross-positive / net-negative** after 0.5 bps costs (PF \> 1 on mvp/fast93). Recent ~12m remains firmly PF \< 1. Regime dependence — do not pool into one edge claim.

## Prior ~12-month mvp baseline (kept)

Period: **2025-09-07 → 2026-09-07**. Channel geometry P0. US500† pre-fix.

| Symbol | Bars | Signals | Trades | Win% | PF | Net P&L | Max DD | Exits |
|--------|------|---------|--------|------|----|---------|--------|-------|
| US100 | 364 836 | 219 | 219 | 47.0% | 0.81 | −2 061.43 | 2 121.95 | 97 stop / 86 tp_mid / 33 stoch_a / 3 time_stop |
| GOLD | 353 302 | 273 | 273 | 45.4% | 0.76 | −3 284.76 | 3 379.53 | 135 stop / 93 tp_mid / 41 stoch_a / 4 time_stop |
| US500† | 361 797 | 61 | 61 | 49.2% | 1.00 | −302.15 | 468.55 | 21 stop / 25 tp_mid / 13 stoch_a / 2 time_stop |

† Pre-channel-fix baseline (unchanged row).

### Channel-fix delta (before → after, cached Capital)

Same windows / cost model. Short smoke GOLD unchanged (see PR #3); longer tapes do move.

| Window | Symbol | Trades | Win% | PF | Net P&L | Max DD |
|--------|--------|--------|------|----|---------|--------|
| ~12m | GOLD | 272 → **273** | 45.2 → **45.4** | 0.76 → **0.76** | −3 292.34 → **−3 284.76** | 3 387.11 → **3 379.53** |
| ~12m | US100 | 215 → **219** | 47.4 → **47.0** | 0.82 → **0.81** | −1 962.42 → **−2 061.43** | 2 022.94 → **2 121.95** |
| ~90d | GOLD | 56 → **56** | 50.0 → **50.0** | 0.91 → **0.91** | −394.20 → **−394.20** | 560.90 → **560.90** |
| ~90d | US100 | 51 → **53** | 39.2 → **41.5** | 0.58 → **0.65** | −817.04 → **−713.79** | 927.45 → **839.46** |

Read: inverted-rail rejection is a **correctness** gate, not an edge unlock.

### Funnel (stage counts over the ~12m window)

Post-fix for US100/GOLD; US500 still pre-fix.

| Stage | US100 | GOLD | US500† |
|-------|-------|------|--------|
| channelValidDown | 17 055 | 27 067 | 7 758 |
| atLowerRail | 6 595 | 8 426 | 2 585 |
| execQuadOs | 1 829 | 1 217 | 893 |
| bullishDiv | 895 | 662 | 326 |
| longSizingOk | 317 | 219 | 91 |
| channelValidUp | 19 656 | 31 496 | 8 699 |
| atUpperRail | 6 306 | 10 637 | 3 117 |
| execQuadOb | 1 541 | 2 347 | 865 |
| bearishDiv | 708 | 1 085 | 335 |
| shortSizingOk | 195 | 378 | 45 |

### Honest read

- **Not a performance claim.** Over ~12 months GOLD/US100 remain negative after costs (PF \< 1) under mvp; fast93 helps only marginally.
- Older year (~2024-09→2025-09) shows PF \> 1 before costs wipe net — still no live edge claim.
- Signal density: US100 ~0.6/day, GOLD ~0.7/day on recent 1m tape.

### Prior ~90d baseline (kept)

Period: **2026-06-09 → 2026-09-07** (~90 calendar days).

| Symbol | Bars | Signals | Trades | Win% | PF | Net P&L | Max DD | Exits |
|--------|------|---------|--------|------|----|---------|--------|-------|
| GOLD | 87 770 | 56 | 56 | 50.0% | 0.91 | −394.20 | 560.90 | 25 stop / 24 tp_mid / 6 stoch_a / 1 time_stop |
| US500 | 89 992 | 7 | 7 | 57.1% | 1.54 | +40.75 | 75.46 | 3 stop / 3 stoch_a / 1 tp_mid |

### Earlier smoke (kept for comparison)

| Symbol | Window | Bars | Trades | Win% | PF | Net P&L |
|--------|--------|------|--------|------|----|---------|
| GOLD | 2026-09-01 → 09-05 | 5 395 | 4 | 50% | 0.69 | −42.81 |
| US500 | 2026-09-01 → 09-05 | 5 490 | 1 | 100% | Inf | +15.06 |

## What it does

1. Builds dual-TF context (`1m` execution + `5m` structure) via existing `buildDualTfContext` / indicators.
2. On each 1m bar after warmup, runs `evaluateK1AtBar` (same criteria as `diagnoseK1` / SIGNAL `allPass`).
3. Enters at bar close when long or short **allPass**.
4. Exits per **exit mode** (see table above): stop always first; then mid and/or opposite rail and/or STOCH_A; optional time stop (default 20 × 1m).
5. Applies a simple round-trip **spread/slip** placeholder (`costBpsPerSide`, default 0.5 bps/side).

## How to run

```bash
cd kurisko-qr-pro
npm install

# Unit tests for entry/exit helpers (offline)
npm run k1:test

# Offline smoke (synthetic candles — usually 0 SIGNAL trades; proves CLI wiring)
npm run k1:smoke

# Capital.com demo history (US100 / US500 / GOLD)
# Credentials: CAPITAL_API_KEY, CAPITAL_IDENTIFIER, and CAPITAL_API_PASSWORD
# Liquidity env also works: CAPITAL_PASSWORD (+ CAPITAL_ENV=demo)
npm run k1:backtest -- --symbol US100 --days 3
npm run k1:backtest -- --symbol GOLD --from 2026-09-01 --to 2026-09-03

# Exit-mode A/B on cached ~12m
npm run k1:backtest -- --symbol GOLD --from 2025-09-07T22:00:00Z --to 2026-09-07T05:05:00Z --exit-mode fast93 --no-funnel
npm run k1:backtest -- --symbol US100 --from 2025-09-07T22:00:00Z --to 2026-09-07T05:05:00Z --exit-mode tp2_rail --no-funnel

# Deep history fetch only (extends gitignored cache; no engine)
npm run k1:deep-fetch -- --symbol GOLD --from 2024-09-01 --to 2026-09-07 --max-pages 1000
npm run k1:deep-fetch -- --symbol US100 --from 2024-09-01 --to 2026-09-07 --max-pages 1000

# Year-slice backtest on deep cache (avoid full 2y OOM)
npm run k1:backtest -- --symbol GOLD --from 2024-09-01 --to 2025-09-07 --exit-mode mvp --max-pages 1000 --no-funnel
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

### Symbol → Capital epic

| Kurisko / TV | Capital CFD epic |
|--------------|------------------|
| US100, NAS100, NQ | **US100** |
| US500, ES, SPX | **US500** |
| GOLD, XAUUSD, GC | **GOLD** |

Pinned in `scripts/kurisko/capital-fetch.ts` (`CAPITAL_EPIC_ALIASES`) and `src/lib/capital/client.ts`.

### History depth (demo observed)

- Capital `MINUTE` pages return up to 1000 bars; CLI pages backward (default `--max-pages 500`; deep `1000`) with weekend/empty-window skips.
- **Deep cache (Aug 2024 → Sep 2026):** GOLD ≈ 713k bars, US100 ≈ 728k — demo ceiling **not** exhausted at 1000 pages when extending older-than-cache.
- Full 2y engine pass OOMs here; use year slices for metrics.

## Interpreting output

- `signals` — bars where K1 `allPass` fired (before sizing/level rejection).
- `trades` / `winRate` / `profitFactor` / `netPnl` — closed trades after costs.
- `funnelSnippet` — gate counts from `diagnoseK1Funnel` (explains zero-trade windows).
- `byExitReason` — stop / tp_mid / tp_rail / stoch_a / time_stop / eod_flat.
- `exitMode` — which priority table ran.

Strict K1 alignment is rare; short demo windows often print **0 trades**. Use funnel counts to tune, not marketing claims from RAG/video.

## Code map

| Path | Role |
|------|------|
| `src/lib/kurisko/backtest/k1-diagnose.ts` | Criteria / `evaluateK1AtBar` |
| `src/lib/kurisko/backtest/k1-entry-exit.ts` | Stop / TP mid / TP rail / stoch / time + exit modes |
| `src/lib/kurisko/backtest/k1-event-engine.ts` | Walk-forward engine |
| `src/lib/kurisko/backtest/k1-metrics.ts` | PF / win rate / DD |
| `scripts/kurisko/k1-backtest-run.ts` | CLI (`--exit-mode`) |
| `scripts/kurisko/capital-fetch.ts` | Script-safe Capital 1m pull + disk cache |
| `scripts/kurisko/capital-deep-fetch.ts` | Fetch-only deep history extender |

## Gaps (still open)

- No scale-out partials (TP1 mid then trail to rail) — rail modes **replace** mid instead
- No news / session filters
- No tick-accurate stops (OHLC pathing: stop before TP on same bar)
- Channel mid locked at entry for TP1; TP2 uses live opposite rail when channel valid
- Synthetic `--fixture` is wiring-only
- Single-symbol CLI; no sweep / walk-forward yet
- Full multi-year single-pass needs a lower-memory engine path

See also: [KURISKO_VIDEO_EXTRACT.md](./KURISKO_VIDEO_EXTRACT.md) (teaching extract) and `.documents/John_Kurisko_QuadRotation_Scalping_RAG.md` (quantified K1 table).
