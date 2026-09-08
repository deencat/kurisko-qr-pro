import type { KuriskoChannelEpisodeDraw } from "./chart-window-types";

export interface ChannelRailPoint {
  t: number;
  value: number;
}

export interface ChannelEpisodeRailSeries {
  upper: ChannelRailPoint[];
  mid: ChannelRailPoint[];
  lower: ChannelRailPoint[];
  /** True when rails are sloping (not a flat one-price line). */
  sloping: boolean;
}

/** lower < upper at both segment ends (parallel channel drawable). */
export function episodeRailsOriented(ep: KuriskoChannelEpisodeDraw): boolean {
  return ep.lowerStart < ep.upperStart && ep.lowerEnd < ep.upperEnd;
}

/**
 * Build sloping upper / mid / lower segments for a chart overlay.
 * Mid is the midpoint of the parallel rails at each endpoint.
 */
export function episodeToRailSeries(ep: KuriskoChannelEpisodeDraw): ChannelEpisodeRailSeries | null {
  if (ep.tEnd <= ep.tStart) return null;
  if (!episodeRailsOriented(ep)) return null;

  const midStart = (ep.upperStart + ep.lowerStart) / 2;
  const midEnd = (ep.upperEnd + ep.lowerEnd) / 2;
  const sloping =
    ep.upperStart !== ep.upperEnd ||
    ep.lowerStart !== ep.lowerEnd ||
    midStart !== midEnd;

  return {
    upper: [
      { t: ep.tStart, value: ep.upperStart },
      { t: ep.tEnd, value: ep.upperEnd },
    ],
    mid: [
      { t: ep.tStart, value: midStart },
      { t: ep.tEnd, value: midEnd },
    ],
    lower: [
      { t: ep.tStart, value: ep.lowerStart },
      { t: ep.tEnd, value: ep.lowerEnd },
    ],
    sloping,
  };
}
