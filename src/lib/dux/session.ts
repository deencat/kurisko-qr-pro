/** Classify US equity bar open time into PM / RTH / AH using America/New_York wall clock. */

export type DuxSession = "pm" | "rth" | "ah" | "other";

function etParts(ms: number): { hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour") === "24" ? "0" : get("hour"));
  const minute = Number(get("minute"));
  const wd = get("weekday");
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, minute, weekday: weekdayMap[wd] ?? -1 };
}

export function classifyUsSession(barOpenMs: number): DuxSession {
  const { hour, minute, weekday } = etParts(barOpenMs);
  if (weekday === 0 || weekday === 6) return "other";
  const mins = hour * 60 + minute;
  // Premarket 04:00–09:29
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pm";
  // RTH 09:30–15:59
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "rth";
  // AH 16:00–19:59 (common extended)
  if (mins >= 16 * 60 && mins < 20 * 60) return "ah";
  return "other";
}
