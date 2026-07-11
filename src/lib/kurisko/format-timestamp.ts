/** Candle `t` from Capital/Lighter is Unix ms UTC. */

export interface FormattedMarketTime {
  utc: string;
  et: string;
  hkt: string;
  /** Browser local timezone */
  local: string;
}

function fmtInZone(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(new Date(ts))
    .replace(",", "");
}

export function formatMarketTimestamp(ts: number): FormattedMarketTime {
  return {
    utc: `${fmtInZone(ts, "UTC")} UTC`,
    et: `${fmtInZone(ts, "America/New_York")} ET`,
    hkt: `${fmtInZone(ts, "Asia/Hong_Kong")} HKT`,
    local: `${fmtInZone(ts, Intl.DateTimeFormat().resolvedOptions().timeZone)} local`,
  };
}

export function formatMarketTimestampBlock(ts: number): string {
  const f = formatMarketTimestamp(ts);
  return `${f.utc} · ${f.et} · ${f.hkt}`;
}
