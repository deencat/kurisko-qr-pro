import type { CandleResolution } from "@/lib/lighter/client";

export type CapitalResolution =
  | "MINUTE"
  | "MINUTE_5"
  | "MINUTE_15"
  | "MINUTE_30"
  | "HOUR"
  | "HOUR_4"
  | "DAY"
  | "WEEK";

const TO_CAPITAL: Record<CandleResolution, CapitalResolution> = {
  "1m": "MINUTE",
  "5m": "MINUTE_5",
  "15m": "MINUTE_15",
  "30m": "MINUTE_30",
  "1h": "HOUR",
  "4h": "HOUR_4",
  "1d": "DAY",
};

export function toCapitalResolution(resolution: CandleResolution): CapitalResolution {
  return TO_CAPITAL[resolution];
}

export function capitalBarMs(resolution: CandleResolution): number {
  switch (resolution) {
    case "1m":
      return 60_000;
    case "5m":
      return 5 * 60_000;
    case "15m":
      return 15 * 60_000;
    case "30m":
      return 30 * 60_000;
    case "1h":
      return 60 * 60_000;
    case "4h":
      return 4 * 60 * 60_000;
    case "1d":
      return 24 * 60 * 60_000;
    default:
      return 5 * 60_000;
  }
}
