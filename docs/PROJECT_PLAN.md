# Kurisko QR Pro — Project plan

> **Last updated:** 2026-08-03  
> **Kurisko design:** [KURISKO_DATA_PERSISTENCE.md](./KURISKO_DATA_PERSISTENCE.md) · [KURISKO_QR_VPS.md](./KURISKO_QR_VPS.md)  
> **Dux GUS research:** [dux/GUS_PARAM_SCHEMA.md](./dux/GUS_PARAM_SCHEMA.md) · [dux/PHASE1_DATA.md](./dux/PHASE1_DATA.md) · [dux/PHASE2_BACKTEST.md](./dux/PHASE2_BACKTEST.md)

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

Full phased checklist: [KURISKO_DATA_PERSISTENCE.md](./KURISKO_DATA_PERSISTENCE.md).

---

## Track B — Dux Gap-Up Short (GUS)

| Phase | Status | Outcome |
|-------|--------|---------|
| **P0** Gap defs + param grids | ✅ Done | [GUS_PARAM_SCHEMA.md](./dux/GUS_PARAM_SCHEMA.md) + smoke seed + FIX_* fixtures |
| **P1** Historical data store + Futu ingest | ✅ Done | `src/lib/dux` (`node:sqlite`) + fixtures + OpenD ingest |
| **P2** Event-driven backtest + sweeps | ✅ Done / verified | Engine + smoke + `gap_min` family sweep |
| **P3** Paper forward + parity | **Next** | Shadow fills, no live shorts |
| **P4** Futu micro-live shorts | Pending | `max_sell_short` gate; Webull backup |

### Phase 2 verification (2026-08-03)

```bash
npm run dux:test    # Phase 1 still green
npm run dux:smoke   # PHASE2_SMOKE_PASSED
npm run dux:sweep -- --family gap_min
```

| Check | Result |
|-------|--------|
| FIX_ALLOW trades (≥1 short+cover) | Pass |
| FIX_CROWDED skip `crowded_pm` | Pass |
| FIX_NANO skip `nano_rotation` | Pass |
| Sweep `gap_min` ranked JSON | Pass → `data/dux/runs/` |

See [dux/PHASE2_BACKTEST.md](./dux/PHASE2_BACKTEST.md).

### Phase 1 verification (2026-08-02)

```bash
npm run dux:test
# PHASE1_SELFTEST_PASSED
```

Broker notes: Futu HK primary for US shorts (locate-gated); Webull HK ETB-only backup. Quota = distinct symbols / 7 days.

---

## Vision

Ship a measurable GUS research loop (data → backtest → paper) before live size. Kurisko remains the Capital.com scanner; Dux stays under `docs/dux` + `src/lib/dux` + `scripts/dux`.
