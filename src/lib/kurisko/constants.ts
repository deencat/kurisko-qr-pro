/** Kurisko intraday backtest bounds (mirrors Aziz). */
export const KURISKO_MIN_BACKTEST_DAYS = 1;
export const KURISKO_MAX_BACKTEST_DAYS = 30;
export const KURISKO_WARMUP_BARS_1M = 120;

export const KURISKO_STOCH_THRESH_OVERSOLD = 20;
export const KURISKO_STOCH_THRESH_OVERBOUGHT = 80;

export const KURISKO_STOCH_PARAMS = [
  { key: "A" as const, period: 9, smooth: 3 },
  { key: "B" as const, period: 14, smooth: 3 },
  { key: "C" as const, period: 34, smooth: 3 },
  { key: "D" as const, period: 60, smooth: 10 },
];

export const KURISKO_DEFAULT_CHANNEL_TOUCH_PCT = 0.001;
export const KURISKO_DEFAULT_VWAP_TOUCH_PCT = 0.0015;
export const KURISKO_DEFAULT_STOP_BUFFER_PCT = 0.0005;
export const KURISKO_DEFAULT_EMBED_BARS_5M = 3;
export const KURISKO_DEFAULT_EMBED_BARS_1M = 5;
/** Quad Rotation pillar 3 — optional strict filter (default off). */
export const KURISKO_DEFAULT_REQUIRE_VWAP = false;
/** Quad Rotation pillar 4 — optional strict filter (default off). */
export const KURISKO_DEFAULT_REQUIRE_REVERSAL_CANDLE = false;
