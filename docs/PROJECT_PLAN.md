# Kurisko QR Pro — Project plan

> **Last updated:** 2026-08-02  
> **Kurisko design:** [KURISKO_DATA_PERSISTENCE.md](./KURISKO_DATA_PERSISTENCE.md) · [KURISKO_QR_VPS.md](./KURISKO_QR_VPS.md)  
> **Dux GUS research:** [dux/GUS_PARAM_SCHEMA.md](./dux/GUS_PARAM_SCHEMA.md) · [dux/PHASE1_DATA.md](./dux/PHASE1_DATA.md)

Two tracks in this repo:

1. **Kurisko QR Pro** — Capital.com VPS scanner (live + persistence)
2. **Dux GUS research** — US equity short strategy (history → backtest → paper → Futu live later)

---

## Track A — Kurisko QR scanner

| Area | Status | Notes |
|------|--------|-------|
| Live K1 scan + scheduler | Done | 60s tick, in-memory cache |
| TradingView webhook | Done | Instant alerts on VPS |
| Gap / premarket / levels widgets | Done | Cached in RAM per tick |
| Data persistence | **Done** | SQLite candles, snapshots, alerts |
| Replay API + UI | **Done** | History routes + scanner UI |
| METS backtest port | Out of scope | Stays in METS-v1 |

Full phased checklist (Phases 0–4): see git history / earlier sections in this file from the persistence landing commit, or [KURISKO_DATA_PERSISTENCE.md](./KURISKO_DATA_PERSISTENCE.md).

---

## Track B — Dux Gap-Up Short (GUS)

| Phase | Status | Outcome |
|-------|--------|---------|
| **P0** Gap defs + param grids | ✅ Done | [GUS_PARAM_SCHEMA.md](./dux/GUS_PARAM_SCHEMA.md) + smoke seed + FIX_* fixtures |
| **P1** Historical data store + Futu ingest | ✅ Done / verified | `src/lib/dux` (`node:sqlite`) + fixtures + OpenD ingest |
| **P2** Event-driven backtest + sweeps | **Next** | Param grid search on stored bars |
| **P3** Paper forward + parity | Pending | Shadow fills, no live shorts |
| **P4** Futu micro-live shorts | Pending | `max_sell_short` gate; Webull backup |

### Phase 1 verification (2026-08-02)

```bash
npm run dux:test
# PHASE1_SELFTEST_PASSED — FIX_* PM vol / rotation assertions + upsert idempotency

# Live Futu OpenD (when running):
scripts/dux/.venv/bin/python scripts/dux/ingest_futu_history.py \
  --symbol US.AAPL --start 2024-01-02 --end 2024-01-03
# OK US.AAPL 1m bars=2880 -> data/dux/kurisko_dux.db
```

| Check | Result |
|-------|--------|
| Fixture generate + import | Pass |
| Allow / crowded / nano PM asserts | Pass |
| Upsert idempotency | Pass |
| Futu OpenD 1m ingest (when OpenD up) | Pass (2880 bars AAPL sample) |
| Store engine | Node built-in `node:sqlite` (no better-sqlite3 for Dux) |

Broker notes: Futu HK primary for US shorts (locate-gated); Webull HK ETB-only backup. Quota = distinct symbols / 7 days. See [GUS_PARAM_SCHEMA.md](./dux/GUS_PARAM_SCHEMA.md).

---

## Vision

Ship a measurable GUS research loop (data → backtest → paper) before live size. Kurisko remains the Capital.com scanner; Dux stays a separate module under `docs/dux` + `src/lib/dux` + `scripts/dux`.
