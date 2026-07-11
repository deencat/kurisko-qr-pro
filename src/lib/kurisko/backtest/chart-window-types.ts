import { KURISKO_STOCH_PARAMS } from "../constants";

export interface StochKdPoint {
  k: number | null;
  d: number | null;
}

export interface KuriskoChartBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  sessionVwap: number | null;
  fast93: StochKdPoint;
  fast143: StochKdPoint;
  fast343: StochKdPoint;
  full6010: StochKdPoint;
  isMatch: boolean;
}

/** Serializable channel segment for chart overlay (built server-side). */
export interface KuriskoChannelEpisodeDraw {
  kind: "down" | "up";
  /** P3 lock time — forward extension starts here. */
  tConfirm: number;
  tStart: number;
  tEnd: number;
  slopeDeg: number;
  upperStart: number;
  upperEnd: number;
  lowerStart: number;
  lowerEnd: number;
  p1: { t: number; price: number };
  p2: { t: number; price: number };
  p3: { t: number; price: number };
  highlight: boolean;
}

/** TradingView-style linear regression channel overlay. */
export interface KuriskoRegressionEpisodeDraw {
  tStart: number;
  tEnd: number;
  length: number;
  devMult: number;
  slopePerBar: number;
  midStart: number;
  midEnd: number;
  upperStart: number;
  upperEnd: number;
  lowerStart: number;
  lowerEnd: number;
  highlight: boolean;
  broken: boolean;
}

export interface KuriskoChartMeta {
  totalBars: number;
  requestedDays: number;
  calendarDaysCovered: number;
  structureResolution: string;
  channelEpisodeCount: number;
  channelAtMatch: {
    valid: boolean;
    direction: string;
    slopeDeg: number | null;
  };
}

export interface KuriskoChartWindow {
  matchBarIndex: number;
  matchTs: number;
  structureResolution: string;
  bars: KuriskoChartBar[];
  channelEpisodes: KuriskoChannelEpisodeDraw[];
  regressionEpisodes?: KuriskoRegressionEpisodeDraw[];
  meta: KuriskoChartMeta;
}

export const KURISKO_CHART_STOCH_PANES = [
  { id: "fast93", label: "Fast Stoch 9,3", field: "fast93" as const, dColor: "#ef4444" },
  { id: "fast143", label: "Fast Stoch 14,3", field: "fast143" as const, dColor: "#22c55e" },
  {
    id: "fast343",
    label: `Fast Stoch ${KURISKO_STOCH_PARAMS[2].period},${KURISKO_STOCH_PARAMS[2].smooth}`,
    field: "fast343" as const,
    dColor: "#3b82f6",
  },
  { id: "full6010", label: "Full Stoch 60,10", field: "full6010" as const, dColor: "#f0abfc" },
] as const;
