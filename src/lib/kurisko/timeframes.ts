import { capitalBarMs } from "@/lib/capital/resolutions";
import type { CandleResolution } from "@/lib/lighter/client";

export interface KuriskoTimeframePair {
  id: string;
  label: string;
  execution: CandleResolution;
  structure: CandleResolution;
}

/** Timeframe presets: canonical dual-TF plus experimental single-TF variants. */
export const KURISKO_TIMEFRAME_PAIRS: KuriskoTimeframePair[] = [
  { id: "1m+5m", label: "1m execution · 5m structure (canonical)", execution: "1m", structure: "5m" },
  { id: "1m-only", label: "1m only · channel + quad + execution (experimental)", execution: "1m", structure: "1m" },
  { id: "5m+15m", label: "5m execution · 15m structure", execution: "5m", structure: "15m" },
  { id: "15m+1h", label: "15m execution · 1h structure", execution: "15m", structure: "1h" },
];

export const KURISKO_DEFAULT_TIMEFRAME_PAIR_ID = "1m+5m";

export function getKuriskoTimeframePair(id?: string): KuriskoTimeframePair {
  return KURISKO_TIMEFRAME_PAIRS.find((p) => p.id === id) ?? KURISKO_TIMEFRAME_PAIRS[0]!;
}

export function kuriskoTimeframeLabel(pair: KuriskoTimeframePair): string {
  return pair.execution === pair.structure ? `${pair.execution} only` : `${pair.execution}+${pair.structure}`;
}

export function kuriskoStructurePeriodMs(pair: KuriskoTimeframePair): number {
  return capitalBarMs(pair.structure);
}
