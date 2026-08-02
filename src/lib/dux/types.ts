/** Dux research candle (US equity). Times in unix ms UTC. */
export interface DuxCandle {
  symbol: string;
  resolution: "1m" | "1d";
  /** Classified session for the bar open time in America/New_York. */
  session: "pm" | "rth" | "ah" | "other";
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  source: string;
}

export interface DuxSymbolMeta {
  symbol: string;
  floatShares: number | null;
  mcapUsd: number | null;
  sector: string | null;
  isBiotech: boolean;
  isEnergy: boolean;
  isChinaAdr: boolean;
  asOf: number | null;
  source: string;
}

export interface DuxIngestLogRow {
  id: number;
  symbol: string;
  resolution: string;
  startDate: string;
  endDate: string;
  bars: number;
  status: string;
  message: string;
  at: number;
}

/** Smoke / sweep params — see docs/dux/GUS_PARAM_SCHEMA.md */
export interface GusParams {
  strategy: "gus";
  version: number;
  gap_ref: "open" | "pm_last" | "pm_high" | "open_and_pm_last";
  gap_min: number;
  crowded_pm_m: number;
  crowded_action: "block" | "size_0.5" | "size_0.25" | "allow";
  soft_warn_pm_m: number | null;
  crowded_vs_mcap: boolean;
  K: number;
  revise_after_open: boolean;
  push_base: "open" | "swing_low";
  push_min: number;
  push_max: number | null;
  float_tier_push: boolean;
  push_size_scale: boolean;
  consol_min_minutes: number;
  consol_max_width_pct: number;
  consol_detect: "clock_after_peak" | "range_compress";
  stop_ref: "consol_high" | "push_ext";
  entry_window_end: string;
  partial_frac: number;
  crack_pct: number;
  crack_ref: "consol_low" | "consol_mid";
  partial_trigger: "clock_10_11" | "first_red_bar" | "break_consol_mid";
  max_adds: number;
  t_clock: string;
  vol_frac_min: number;
  vol_frac_max: number | null;
  vol_clock_action: "block" | "size_down" | "journal_only";
  mcap_max: number;
  mcap_price_ref: "prior_close" | "open";
  float_min: number;
  float_max: number;
  price_min: number;
  price_ref: "prior_close" | "open";
  exclude_biotech: boolean;
  exclude_energy: boolean;
  exclude_china: boolean;
  float_nano_max: number;
  rotation_trigger: number;
  rotation_basis: "pm_volume" | "vol_by_11" | "full_day_vol";
  retrace_min: number;
  variant_action: "block_standard_gus" | "reroute_pullback_bounce" | "size_down_only";
  bounce_confirm: "retrace_only" | "retrace_then_green_bar" | "retrace_then_hold_vwap";
  size_mult_by_bucket: Record<string, number>;
  pm_high_size_mult: number;
  float_cap_pct: number;
  vol_cap_pct: number;
  base_risk_pct: number;
  handoff_enabled: boolean;
  next_gap_max: number;
  dryup_ratio_max: number;
  handoff_entry: "open_short" | "consol_breakdown" | "first_red_30m";
  handoff_size_mult: number;
  stop_buffer_pct: number;
  max_risk_pct: number;
  target_mode: "fixed_r" | "fade_pct" | "trail" | "scale_ladder";
  target_fade_pct: number;
  scale_ladder_pcts: number[];
  eod_flat: boolean;
  t_flat: string;
  min_rr: number | null;
  locate_model: "always_ok" | "random_skip" | "skip_if_rotation_gt" | "skip_if_nano_float";
  locate_skip_rate: number;
  borrow_fee_apr: number;
  slippage_bps: number;
  spread_bps: number;
}
