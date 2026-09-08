# K1 event backtest MVP

Research-only bar-by-bar backtest for **K1 Quad Divergence** (Holy Grail). No live trading / order routing.

## ~12-month Capital demo results (VIEW)

Period: **2025-09-07 → 2026-09-07** (~365 calendar days). Equity \$10k, risk 2%, cost 0.5 bps/side, time stop 20×1m. Capital demo 1m OHLC (synthetic volume). Epic map: `US100`/`NAS100`/`NQ` → Capital CFD **US100**.

**Channel geometry P0** (reject inverted/crossed rails): GOLD + US100 re-run on the same cached window after the fix. US500 row is still the pre-fix baseline (not re-run here).

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

Read: inverted-rail rejection is a **correctness** gate, not an edge unlock. ~12m stays flat-to-negative (GOLD slightly less bad; US100 slightly more bad / more trades). ~90d US100 improves a bit on PF/DD but remains PF \< 1. GOLD ~90d identical.

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

`channelValid*` counts drop vs pre-fix (US100 −141/−284; GOLD −168/−143) as crossed rails are rejected; downstream sizing still feeds trades.

### Honest read

- **Not a performance claim.** Over ~12 months GOLD/US100 remain negative after costs (PF \< 1); US500 pre-fix PF ≈ 1.00 with costs (−305) wiping a tiny gross (+2.87).
- Channel P0 does **not** create edge on these tapes — metrics move only slightly; short smoke was unchanged.
- US100 ~12m sample n=219 — still no edge under this MVP cost/pathing model.
- Signal density: US100 ~0.6/day, GOLD ~0.7/day, US500 ~0.17/day of 1m tape (strict K1 stays rare on the index).
- Funnel remains alive on all three (rails → quad → div → sizing).

### Prior ~90d baseline (kept)

Period: **2026-06-09 → 2026-09-07** (~90 calendar days). Post-fix GOLD unchanged; US100 after-fix shown in delta table above (53 / 41.5% / 0.65 / −713.79 / 839.46 on 91 094 bars).

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

# Capital.com demo history (US100 / US500 / GOLD)
# Credentials: CAPITAL_API_KEY, CAPITAL_IDENTIFIER, and CAPITAL_API_PASSWORD
# Liquidity env also works: CAPITAL_PASSWORD (+ CAPITAL_ENV=demo)
npm run k1:backtest -- --symbol US100 --days 3
npm run k1:backtest -- --symbol US500 --days 3
npm run k1:backtest -- --symbol GOLD --from 2026-09-01 --to 2026-09-03

# Multi-month / ~12m (deep paging + local cache under data/kurisko/capital/)
npm run k1:backtest -- --symbol US100 --days 365 --max-pages 500
npm run k1:backtest -- --symbol GOLD --from 2025-09-07T22:00:00Z --to 2026-09-07T05:05:00Z --max-pages 500
npm run k1:backtest -- --symbol US500 --from 2025-09-07T22:00:00Z --to 2026-09-07T05:05:00Z --max-pages 500
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

### Symbol → Capital epic

| Kurisko / TV | Capital CFD epic |
|--------------|------------------|
| US100, NAS100, NQ | **US100** |
| US500, ES, SPX | **US500** |
| GOLD, XAUUSD, GC | **GOLD** |

Pinned in `scripts/kurisko/capital-fetch.ts` (`CAPITAL_EPIC_ALIASES`) and `src/lib/capital/client.ts`. Demo search resolves `US100` directly; `NAS100`/`NQ` do not — aliases required.

### History depth (demo observed)

- Capital `MINUTE` pages return up to 1000 bars; this CLI pages backward (default `--max-pages 200`; use `500` for ~12m) with weekend/empty-window skips (Liquidity-style).
- **~12m window (Sep 2025 → Sep 2026):** US100 ≈ 365k bars, GOLD ≈ 354k, US500 ≈ 362k — full requested year completed without hitting an API empty floor (page budget binds first).
- A follow-on US100 probe still returned continuous 1m data back to **2025-08-04** (~13 months / 400k bars at `--max-pages 400`); **demo ceiling not exhausted** in this run — deeper than 13m is likely with a higher page budget.
- Prior ~90d pulls: GOLD/US500 ≈ 88–90k bars. Cache merge fills older/newer gaps so repeat runs stay offline once seeded.

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
