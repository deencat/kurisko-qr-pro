/** ET wall-clock helpers for GUS signals (America/New_York). */

export function etParts(ms: number): { hour: number; minute: number; mins: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour") === "24" ? "0" : get("hour"));
  const minute = Number(get("minute"));
  const y = get("year");
  const m = get("month");
  const d = get("day");
  return { hour, minute, mins: hour * 60 + minute, ymd: `${y}-${m}-${d}` };
}

/** Parse "HH:MM" ET clock string to minutes from midnight. */
export function parseEtClock(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function etDayKey(ms: number): string {
  return etParts(ms).ymd;
}
