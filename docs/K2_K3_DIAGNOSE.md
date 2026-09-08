# K2 / K3 diagnose engines

Research-only criteria engines for **K2 20/20 Bull Flag** and **K3 Bear Flag / Sell Strength**, aligned with `.documents/John_Kurisko_QuadRotation_Scalping_RAG.md` and `docs/KURISKO_VIDEO_EXTRACT.md` (embedded **60,10** + fast **9,3** pullback / sell-strength). No live trading.

## What they mean in code

| Strategy | Direction | Macro (structure TF, usually 5m) | Execution (1m) |
|----------|-----------|----------------------------------|----------------|
| **K2** `k2_stoch_bull_flag` | LONG continuation | `CHANNEL_VALID_UP` **or** price > EMA_20 rising; **`EMBEDDED_BULL`** = STOCH_D(60,10) ≥ 80 for N bars | Flagpole (≥2 green off EMA_20) → pullback to EMA_20 + quad dip (A toward 20) → **STOCH_A ≤ 22 hook up** |
| **K3** `k3_bear_flag` | SHORT / exit longs | `CHANNEL_VALID_DOWN` **or** price < EMA_200; **`EMBEDDED_BEAR`** = STOCH_D ≤ 20 for N bars | Dead-cat to upper/mid → A surges toward 80 → **cross 78–80**; price below EMA_20 & EMA_50 |

**Exits / visual cues**

- K2 long: stop under `min(pullback_low, EMA_20)` · TP upper rail/pts · **STOCH_A ≥ 80** · embed lost (D drops below 80).
- K3 short: stop above bounce high · TP lower rail · **STOCH_A ≤ 20**.
- K3 overlay: if K3 macro (E1+E2) and **STOCH_A ≥ 80** → **`mandatoryLongExit`** for K1 longs (do not hold for channel breakout).

Reuse: `embeddedBull` / `embeddedBear`, quad stack, channel geometry, dual-TF context (now includes structure EMAs).

## Modules

| Path | Role |
|------|------|
| `src/lib/kurisko/backtest/k2-k3-helpers.ts` | Pure RAG predicates |
| `src/lib/kurisko/backtest/k2-diagnose.ts` | K2 step engine + funnel / bestMatch / latestBar |
| `src/lib/kurisko/backtest/k3-diagnose.ts` | K3 step engine + funnel + mandatory long exit |
| `src/lib/kurisko/backtest/k2-k3-entry-exit.ts` | Entry levels + bar exits |
| `src/lib/kurisko/snapshot/k2-k3-stage.ts` | ARM → PULLBACK → HOOK → SIGNAL |
| Snapshot / matrix | `k2` / `k3` diagnose cards + `exitsVisual` + matrix `k2Stage`/`k3Stage` hints |

## How to run

```bash
# Unit tests (RAG criteria, offline)
npm run k2k3:test

# Diagnose funnel on synthetic fixture
npm run k2k3:smoke

# Capital demo tape (needs credentials; research only)
npm run k2k3:diagnose -- --symbol US100 --days 5
```

Strict K2/K3 alignment is uncommon on short windows — use funnel counts (`embedBull5m`, `pullback`, `mandatoryLongExit`, …) the same way as K1.

See also: [K1_BACKTEST.md](./K1_BACKTEST.md), [KURISKO_VIDEO_EXTRACT.md](./KURISKO_VIDEO_EXTRACT.md).
