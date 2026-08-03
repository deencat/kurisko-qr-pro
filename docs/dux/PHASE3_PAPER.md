# Dux Phase 3 — Paper forward + parity

Shadow-trade the Phase 2 GUS engine on stored bars. **No broker orders.** Prove paper fills match batch backtest (parity), then support a forward paper run that journals intents to SQLite.

## Goals

1. **Parity** — On the same FIX_* (or any) bars + smoke params, paper session trades must match backtest trades (count, sides, shares, entry/exit timestamps, PnL within tolerance).
2. **Paper journal** — Persist runs, shadow orders, and trades under `data/dux/kurisko_dux.db`.
3. **Forward paper** — Replay symbols from the store as a paper session (same fill model as Phase 2); suitable for daily cron after Futu ingest.

## Non-goals

- Futu `place_order` / unlock (Phase 4)
- UI dashboard
- Next-day handoff / full nano bounce path (still deferred)

## Fill model (identical to Phase 2)

- Short / cover at **next bar open** ± (`slippage_bps + spread_bps/2`)
- Size: `base_risk_pct × equity`, float/vol caps, crowded/vol_clock mults
- Default equity: `$100,000`

## Architecture

```
1m bars (store)
    │
    ├─► runBacktestOnSymbols  ──► BacktestResult   (reference)
    │
    └─► runPaperSession
            │
            ├─ PaperBroker (shadow fills only)
            ├─ same GUS day engine
            └─ persist paper_runs / paper_orders / paper_trades
                    │
                    └─► assertParity(backtest, paper)
```

Parity tolerances:

| Field | Tolerance |
|-------|-----------|
| trade count / symbol | exact |
| shares | exact |
| entryTs / exitTs | exact |
| avgEntry / avgExit | ≤ 1e-6 relative |
| pnl | ≤ $0.01 absolute |

## Schema additions

```sql
paper_runs (
  id INTEGER PK,
  started_at, finished_at,
  mode TEXT,           -- 'parity' | 'forward'
  params_json TEXT,
  equity REAL,
  status TEXT,         -- 'ok' | 'fail'
  summary_json TEXT
)

paper_orders (
  id INTEGER PK,
  run_id INTEGER,
  symbol, t, side,     -- 'short' | 'cover'
  shares, price, reason, source TEXT  -- 'paper'
)

paper_trades (
  id INTEGER PK,
  run_id INTEGER,
  symbol, entry_ts, exit_ts,
  shares, avg_entry, avg_exit, pnl, exit_reason, legs_json
)
```

## Commands

```bash
npm run dux:paper-smoke   # fixtures + parity asserts → PHASE3_PAPER_PASSED
npm run dux:paper         # forward paper on FIX_* (or --symbol)
```

## Acceptance

| Check | Expected |
|-------|----------|
| `npm run dux:test` | PASS (Phase 1) |
| `npm run dux:smoke` | PASS (Phase 2) |
| `npm run dux:paper-smoke` | `PHASE3_PAPER_PASSED` — parity on ALLOW/CROWD/NANO |
| Paper tables written | ≥1 ok run with orders/trades for ALLOW |

### Verified (2026-08-03)

| Check | Result |
|-------|--------|
| `npm run dux:paper-smoke` | PASS — runId≥1, parityOk, ALLOW shadow short+cover |
| Skip parity | CROWD=`crowded_pm`, NANO=`nano_rotation` |

## Modules

```
src/lib/dux/paper/
  types.ts
  broker.ts      # PaperBroker interface + shadow impl
  parity.ts      # compare BacktestResult vs paper
  session.ts     # runPaperSession → persist
  store.ts       # paper_* table helpers
```

## Next

Phase 4: Futu micro-live shorts behind `max_sell_short` + explicit arm flag (default dry-run).
