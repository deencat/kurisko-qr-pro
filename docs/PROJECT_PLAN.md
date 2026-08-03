# Kurisko QR Pro — Project plan

> **Last updated:** 2026-08-03  
> **Kurisko:** [KURISKO_DATA_PERSISTENCE.md](./KURISKO_DATA_PERSISTENCE.md) · [KURISKO_QR_VPS.md](./KURISKO_QR_VPS.md)  
> **Dux GUS:** [PHASE1](./dux/PHASE1_DATA.md) · [PHASE2](./dux/PHASE2_BACKTEST.md) · [PHASE3](./dux/PHASE3_PAPER.md) · [PHASE4](./dux/PHASE4_LIVE.md) · [schema](./dux/GUS_PARAM_SCHEMA.md)

Two tracks:

1. **Kurisko QR Pro** — Capital.com VPS scanner (live + persistence)
2. **Dux GUS** — US equity short research (history → backtest → paper → micro-live)

---

## Track A — Kurisko QR scanner

| Area | Status |
|------|--------|
| Live K1 scan + TV webhook | Done |
| SQLite persistence + replay | Done |
| METS backtest port | Out of scope |

---

## Track B — Dux Gap-Up Short (GUS)

| Phase | Status | Outcome |
|-------|--------|---------|
| **P0** Param schema | ✅ | [GUS_PARAM_SCHEMA.md](./dux/GUS_PARAM_SCHEMA.md) |
| **P1** Data store + Futu ingest | ✅ | `npm run dux:test` |
| **P2** Event backtest + sweeps | ✅ | `npm run dux:smoke` / `dux:sweep` |
| **P3** Paper + parity | ✅ | `npm run dux:paper-smoke` |
| **P4** Futu micro-live | ✅ | `npm run dux:live-smoke` (dry-run default) |

### Full Dux verification

```bash
npm run dux:test && npm run dux:smoke && npm run dux:paper-smoke && npm run dux:live-smoke
```

| Phase | Command | Signal |
|-------|---------|--------|
| P1 | `dux:test` | `PHASE1_SELFTEST_PASSED` |
| P2 | `dux:smoke` | `PHASE2_SMOKE_PASSED` |
| P3 | `dux:paper-smoke` | `PHASE3_PAPER_PASSED` |
| P4 | `dux:live-smoke` | `PHASE4_LIVE_PASSED` |

Live place (optional, OpenD + arm):

```bash
DUX_LIVE_ARMED=1 DUX_TRD_ENV=SIMULATE DUX_SYMBOL_ALLOWLIST=US.AAPL \
  npm run dux:live -- --symbol US.AAPL --broker futu
```

Default `dux:live` is **unarmed dry-run** (no `place_order`).

**UI:** `/day-trade/dux` — paper runs/trades + live dry-run tickets (`GET /api/dux/status`). Link from QR header “Dux”.

---

## Vision

Measurable GUS loop before meaningful size. Scanner UI unchanged by Dux (CLI research track). Next optional work: real gapper history sweeps, pullback/handoff variants, thin paper dashboard.
