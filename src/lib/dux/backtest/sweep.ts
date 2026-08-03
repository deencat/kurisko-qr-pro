import type { GusParams } from "../types";
import { runBacktestOnSymbols } from "./engine";
import type { SweepRow } from "./types";

/** Known one-family grids from GUS_PARAM_SCHEMA.md */
export const PARAM_FAMILIES: Record<string, { key: keyof GusParams; values: (number | string | boolean | null)[] }> = {
  gap_min: { key: "gap_min", values: [0.7, 1.0, 1.5, 2.0] },
  gap_ref: { key: "gap_ref", values: ["open", "pm_last", "pm_high", "open_and_pm_last"] },
  crowded_pm_m: { key: "crowded_pm_m", values: [30, 40, 50, 60, 80] },
  K: { key: "K", values: [5, 7, 8, 10, 12] },
  push_min: { key: "push_min", values: [0.1, 0.15, 0.2, 0.25, 0.3] },
  consol_min_minutes: { key: "consol_min_minutes", values: [30, 45, 60, 90] },
  crack_pct: { key: "crack_pct", values: [0.02, 0.03, 0.05, 0.07] },
};

export function sweepFamily(
  baseline: GusParams,
  family: string,
  symbols: string[],
  equity?: number
): SweepRow[] {
  const spec = PARAM_FAMILIES[family];
  if (!spec) {
    throw new Error(`Unknown family '${family}'. Known: ${Object.keys(PARAM_FAMILIES).join(", ")}`);
  }
  const rows: SweepRow[] = [];
  for (const value of spec.values) {
    const params = { ...baseline, [spec.key]: value } as GusParams;
    const result = runBacktestOnSymbols(params, symbols, equity);
    rows.push({
      family,
      overrides: { [spec.key]: value as number | string | boolean | null },
      summary: result.summary,
    });
  }
  rows.sort((a, b) => b.summary.expectancy - a.summary.expectancy);
  return rows;
}
