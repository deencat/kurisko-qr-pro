# Dux Phase 4 — Futu micro-live shorts

Route GUS short/cover **intents** through hard safety gates to Futu OpenD. **Default is dry-run** (log only). Real or Futu SIMULATE orders require an explicit arm flag.

## Goals

1. **Broker adapter** — Query `max_sell_short` via `get_max_trd_qtys`; place `SELL_SHORT` / `BUY_BACK` via `place_order`.
2. **Hard gates** — Cap size, require allowlist, refuse REAL unless armed; always clamp to `max_sell_short`.
3. **Dry-run first** — `DUX_LIVE_ARMED` unset/false → never call `place_order`; only journal intended tickets.
4. **Audit trail** — Persist `live_runs` / `live_orders` in SQLite.
5. **Smoke without OpenD** — Mock broker proves gate + journal path → `PHASE4_LIVE_PASSED`.

## Non-goals

- Full production OMS / UI
- Webull live path (stub only; ETB-only backup later)
- Overnight hold / handoff
- Auto-unlock trade password in CI

## Safety model

| Gate | Default | Notes |
|------|---------|-------|
| `DUX_LIVE_ARMED` | `false` | Must be `1`/`true` to call `place_order` |
| `DUX_TRD_ENV` | `SIMULATE` | `SIMULATE` or `REAL`; REAL additionally requires arm |
| `DUX_MAX_SHARES` | `100` | Hard cap per order |
| `DUX_MAX_NOTIONAL` | `2000` | `shares * price` cap |
| `DUX_SYMBOL_ALLOWLIST` | empty → **block all live** | Comma list e.g. `US.AAPL` |
| `max_sell_short` | from OpenD / mock | Intent shares clamped to floor(max) |
| Kill | `DUX_LIVE_KILL=1` | Forces dry-run + status `killed` |

**Order of checks:** kill → allowlist → armed (for place) → max shares → max notional → `max_sell_short` clamp → dry-run or place.

## Architecture

```
GUS intents (from paper/backtest day trades)
        │
        ▼
  LiveGate.evaluate(intent)
        │
        ├─ reject → journal live_orders status=rejected
        │
        ▼
  Broker.getMaxSellShort(symbol, price)
        │
        ▼
  clamp qty
        │
        ├─ dry-run (default) → journal status=dry_run
        │
        └─ armed → Broker.placeShort / placeCover
                      │
                      └─ journal status=submitted|error
```

### Futu OpenD (Python)

Uses existing venv `scripts/dux/.venv` + `futu-api`:

```python
OpenSecTradeContext(filter_trdmarket=TrdMarket.US, host=..., port=...)
get_max_trd_qtys(order_type=OrderType.NORMAL, code=symbol, price=price)
# → data['max_sell_short']

place_order(..., trd_side=TrdSide.SELL_SHORT | BUY_BACK, trd_env=TrdEnv.SIMULATE|REAL)
```

CLI bridge: `scripts/dux/futu_trade_bridge.py` — JSON in/out for TS orchestration.

### TypeScript

```
src/lib/dux/live/
  types.ts
  config.ts       # env gates
  gates.ts        # evaluateIntent
  broker.ts       # Broker interface, MockBroker, FutuBroker (spawns Python)
  session.ts      # runLiveSession from intents
  store.ts        # live_* tables
```

## Commands

```bash
# No OpenD required
npm run dux:live-smoke
# PHASE4_LIVE_PASSED — mock gates + dry-run journal

# Dry-run against last paper/backtest intents on FIX_ALLOW (still no place_order)
npm run dux:live -- --symbol US.GUSALLOW

# Optional: OpenD SIMULATE place (dangerous — requires arm)
DUX_LIVE_ARMED=1 DUX_TRD_ENV=SIMULATE DUX_SYMBOL_ALLOWLIST=US.AAPL \
  npm run dux:live -- --symbol US.AAPL --broker futu
```

## Acceptance

| Check | Expected |
|-------|----------|
| `npm run dux:paper-smoke` | Still PASS |
| `npm run dux:live-smoke` | `PHASE4_LIVE_PASSED` |
| Unarmed session | All tickets `dry_run` or `rejected`, zero `submitted` |
| Allowlist empty | Reject `not_allowlisted` |
| Mock max_sell_short=5, intent=100 | Clamped to 5 in dry-run |
| `DUX_LIVE_KILL=1` | status `killed`, no place |

### Verified (2026-08-03)

| Check | Result |
|-------|--------|
| `npm run dux:live-smoke` | PASS — reject / dry-run clamp / kill / armed mock submit |
| `npm run dux:live -- --symbol US.GUSALLOW` | PASS — unarmed dry_run tickets, 0 submitted |

## Webull backup

`WebullBroker` stub throws `WEBULL_NOT_IMPLEMENTED`. Documented for later ETB-only path; not used in smoke.

## Risk note

Phase 4 enables **micro** live only. Do not arm REAL on VPS without allowlist + tiny caps + manual unlock of OpenD trade password.
