# Dux Phase 2 — Event-driven GUS backtest

Same-day Gap-Up Short engine on the Phase 1 SQLite store. Param sweeps search one family at a time vs the smoke seed.

## Scope

| In | Deferred |
|----|----------|
| Gaps 1–8, 10, 12, 13 (standard GUS) | Next-day crowded handoff (gap 11) |
| Nano rotation → block / size_down / journal (gap 9) | Full pullback-bounce entry |
| Smoke seed + FIX_* fixtures | Multi-year Futu train/holdout |
| One-family sweeps (`gap_min`, …) | Locate stress models beyond smoke |

## Fill model

- Shorts and covers fill at **next bar open**.
- Adverse adjustment: `slippage_bps + spread_bps/2`.
- Size from `base_risk_pct × equity` vs stop distance, capped by `float_cap_pct` and `vol_cap_pct`.
- Default sim equity: `$100,000`.

## State machine

`SCAN → PUSH → CONSOL → PARTIAL → FULL → FLAT`

1. Pre-RTH filters: hard (mcap/float/price/sector) → gap → crowded PM → nano.
2. Track push % from RTH open; freeze first valid consolidation box after peak (`clock_after_peak`).
3. Partial short (`partial_frac`) near trigger; add on crack below `crack_ref`.
4. Stop above `stop_ref`; cover via `scale_ladder` / fade / `t_flat` EOD.

## Commands

```bash
# Phase 1 still green
npm run dux:test

# Phase 2 smoke (fixtures + asserts)
npm run dux:smoke
# PHASE2_SMOKE_PASSED — ALLOW trades (~eod_flat); CROWD skip crowded_pm; NANO skip nano_rotation

# Ad-hoc backtest on fixtures
npm run dux:backtest -- --all-fixtures

# One-family sweep (ranked by expectancy)
npm run dux:sweep -- --family gap_min
```

### Verified (2026-08-03)

| Check | Result |
|-------|--------|
| `npm run dux:test` | PASS |
| `npm run dux:smoke` | PASS — ALLOW 1 trade / eod_flat; crowd+nano skips |
| `npm run dux:sweep -- --family gap_min` | PASS — ranked JSON under `data/dux/runs/` |

## Modules

```
src/lib/dux/backtest/
  types.ts        DayContext, Trade, BacktestResult
  clock.ts        America/New_York helpers
  day-context.ts  Pre-RTH metrics + filters
  signals.ts      Push / consol / crack / vol clock
  fills.ts        Size + slip
  engine.ts       Bar-loop state machine
  metrics.ts      WR, expectancy, max DD
  sweep.ts        One-family Cartesian sweep
```

## Fixture expectations

| ID | Outcome |
|----|---------|
| `FIX_ALLOW_STANDARD` | ≥1 short trade |
| `FIX_CROWDED_DENY` | `skipReason=crowded_pm` |
| `FIX_NANO_ROTATION` | `skipReason=nano_rotation` (no standard entry) |

## Next

Phase 3 paper forward with parity vs this engine; later handoff + pullback variants and real multi-day Futu history sweeps.
