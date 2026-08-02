# GUS Parameter Schema (Phase 0)

Frozen **measurement definitions** + **searchable param grids** + **smoke seeds** for Steven Dux Gap-Up Short.

Winners come from backtest sweeps. Smoke seeds only bootstrap the first pipeline run.

Related: [Stephen-Duk-Strategy-SRS.md](../Stephen-Duk-Strategy-SRS.md) · plan: Dux GUS Algo Path

Machine-readable smoke seed: [`gus_smoke_seed.json`](./gus_smoke_seed.json)

---

## Global frozen conventions

| Field | Definition |
|-------|------------|
| Timezone | `America/New_York` |
| `pm_session` | 04:00–09:29 ET |
| `rth_session` | 09:30–16:00 ET |
| `prior_close` | Prior RTH official close (split-adjusted with series) |
| `rth_open` | Official RTH open |
| Symbol format (Futu) | `US.TICKER` |

---

## Gap 1 — Gap %

**Frozen:** `gap_open_pct`, `gap_pm_pct`, `gap_pm_high_pct` vs `prior_close`.

| Param | Type | Grid | Smoke |
|-------|------|------|-------|
| `gap_ref` | enum | `open`, `pm_last`, `pm_high`, `open_and_pm_last` | `open` |
| `gap_min` | float | `0.7`, `1.0`, `1.5`, `2.0` | `1.0` |

---

## Gap 2 — Premarket crowded

**Frozen:** `pm_volume` = sum of PM 1m volumes (shares); `pm_volume_m = pm_volume/1e6`.

| Param | Grid | Smoke |
|-------|------|-------|
| `crowded_pm_m` | `30,40,50,60,80` | `50` |
| `crowded_action` | `block`, `size_0.5`, `size_0.25`, `allow` | `block` |
| `soft_warn_pm_m` | `None` or `crowded-10` | `40` → size_mult 0.5 |
| `crowded_vs_mcap` | off / on with N∈{3,5,10} | off |

---

## Gap 3 — Day volume estimate `K`

**Frozen:** `e_day_vol = pm_volume * K`; `vol_frac_t = vol_by_t / e_day_vol`.

| Param | Grid | Smoke |
|-------|------|-------|
| `K` | `5,7,8,10,12` | `10` |
| `revise_after_open` | on/off | off |

---

## Gap 4 — Push %

**Frozen:** `push_pct = (push_ext - push_base) / push_base`.

| Param | Grid | Smoke |
|-------|------|-------|
| `push_base` | `open`, `swing_low` | `open` |
| `push_min` | `0.10,0.15,0.20,0.25,0.30` | `0.20` |
| `push_max` | `None,0.50,1.0` | `None` |
| `float_tier_push` | on/off | off |
| `push_size_scale` | on/off | off |

---

## Gap 5 — Consolidation

**Frozen:** `consol_high/low/mid/width_pct/len_min`.

| Param | Grid | Smoke |
|-------|------|-------|
| `consol_min_minutes` | `30,45,60,90` | `60` |
| `consol_max_width_pct` | `0.03,0.05,0.08,0.12` | `0.08` |
| `consol_detect` | `clock_after_peak`, `range_compress` | `clock_after_peak` |
| `stop_ref` | `consol_high`, `push_ext` | `consol_high` |
| `entry_window_end` | `11:00,11:30,12:00` | `11:30` |

---

## Gap 6 — Scale-in / crack

**Frozen:** `crack_pct` vs `crack_ref`; `partial_frac`.

| Param | Grid | Smoke |
|-------|------|-------|
| `partial_frac` | `0,0.25,0.5` | `0.5` |
| `crack_pct` | `0.02,0.03,0.05,0.07` | `0.05` |
| `crack_ref` | `consol_low`, `consol_mid` | `consol_low` |
| `partial_trigger` | `clock_10_11`, `first_red_bar`, `break_consol_mid` | `clock_10_11` |
| `max_adds` | `1,2` | `1` |

---

## Gap 7 — Volume clock

**Frozen:** `vol_frac_t` at `t_clock`.

| Param | Grid | Smoke |
|-------|------|-------|
| `t_clock` | `10:30,11:00,11:30` | `11:00` |
| `vol_frac_min` | `0.20,0.25,0.30,0.35` | `0.30` |
| `vol_frac_max` | `None,0.40,0.50,0.60` | `None` |
| `vol_clock_action` | `block`, `size_down`, `journal_only` | `size_down` |

---

## Gap 8 — Hard filters

**Frozen:** `mcap_usd`, `float_shares`, `price_ref`, sector flags.

| Param | Grid | Smoke |
|-------|------|-------|
| `mcap_max` | `50e6,100e6,150e6,200e6` | `100e6` |
| `mcap_price_ref` | `prior_close`, `open` | `prior_close` |
| `float_min` | `0.5e6,1e6` | `1e6` |
| `float_max` | `20e6,50e6,100e6` | `50e6` |
| `price_min` | `2,3,5` | `3` |
| `price_ref` | `prior_close`, `open` | `prior_close` |
| `exclude_biotech` | on/off | on |
| `exclude_energy` | on/off | on |
| `exclude_china` | on/off | on |

---

## Gap 9 — Nano float / rotation / pullback

**Frozen:** `float_rotation`, `retrace_pct`, `nano_float`.

| Param | Grid | Smoke |
|-------|------|-------|
| `float_nano_max` | `1e6,2e6,3e6` | `2e6` |
| `rotation_trigger` | `10,15,20` | `15` |
| `rotation_basis` | `pm_volume`, `vol_by_11`, `full_day_vol` | `pm_volume` |
| `retrace_min` | `0.40,0.50,0.60` | `0.50` |
| `variant_action` | `block_standard_gus`, `reroute_pullback_bounce`, `size_down_only` | `reroute_pullback_bounce` |
| `bounce_confirm` | `retrace_only`, `retrace_then_green_bar`, `retrace_then_hold_vwap` | `retrace_then_green_bar` |

---

## Gap 10 — Float-tiered sizing

**Frozen:** `float_bucket`, `size_mult`, `entry_mode`, caps.

| Param | Grid | Smoke |
|-------|------|-------|
| `size_mult` by bucket | see engine defaults | `lt2:0.25`, `2_5:0.5`, `5_10:0.8`, `10_20:1.0` |
| `pm_high_size_mult` | `0.5,0.6,0.7` | `0.6` |
| `float_cap_pct` | `0.05,0.10,0.15` | `0.10` |
| `vol_cap_pct` | `0.005,0.01,0.02` | `0.01` |
| `base_risk_pct` | `0.0025,0.005,0.01` | `0.005` |

---

## Gap 11 — Crowded next-day handoff

**Frozen:** `crowded_day`, `next_gap_pct`, `dryup_ratio`.

| Param | Grid | Smoke |
|-------|------|-------|
| `handoff_enabled` | on/off | on |
| `next_gap_max` | `0,-0.02,-0.05` | `-0.02` |
| `dryup_ratio_max` | `0.2,0.3,0.5` | `0.3` |
| `handoff_entry` | `open_short`, `consol_breakdown`, `first_red_30m` | `consol_breakdown` |
| `handoff_size_mult` | `0.5,0.75,1.0` | `0.75` |

---

## Gap 12 — Stops / targets / EOD

**Frozen:** `stop_price`, `risk_pct`, fade metrics, `t_flat`.

| Param | Grid | Smoke |
|-------|------|-------|
| `stop_buffer_pct` | `0,0.005,0.01` | `0` |
| `max_risk_pct` | `0.07,0.10,0.12` | `0.10` |
| `target_mode` | `fixed_r`, `fade_pct`, `trail`, `scale_ladder` | `scale_ladder` |
| `target_fade_pct` | `0.15,0.20,0.24,0.26` | `0.24` |
| `eod_flat` | on/off | on |
| `t_flat` | `15:45,15:55,16:00` | `15:55` |
| `min_rr` | `None,2.0,3.0` | `None` |

---

## Gap 13 — Locate / costs

**Frozen:** `base_shares`, `cap_shares`, `final_shares`, `NO_LOCATE`.

| Param | Grid | Smoke |
|-------|------|-------|
| `locate_model` | `always_ok`, `random_skip`, `skip_if_rotation_gt`, `skip_if_nano_float` | `always_ok` (debug) |
| `locate_skip_rate` | `0,0.2,0.4,0.6` | — |
| `borrow_fee_apr` | `0,0.2,1.0,5.0` | `0` |
| `slippage_bps` | `5,10,25,50` | `10` |
| `spread_bps` | `5,10,20` | `10` |

Stress reports **must** include a non-`always_ok` locate model.

---

## Named fixtures (Phase 0.5)

| ID | Intent |
|----|--------|
| `FIX_ALLOW_STANDARD` | Open gap ≥100%, PM vol mid, push ok → allow path |
| `FIX_CROWDED_DENY` | PM vol >50M → block standard GUS |
| `FIX_NANO_ROTATION` | Float &lt;2M, rotation &gt;15 → pullback variant |

Synthetic bars live under `docs/dux/fixtures/`.

---

## Sweep discipline

1. Run smoke seed end-to-end.
2. Sweep **one family at a time** (e.g. gap_ref × gap_min).
3. Train / holdout split by calendar year.
4. Prefer stable OOS expectancy over max in-sample WR.
