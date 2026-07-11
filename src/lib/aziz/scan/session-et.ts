const ET = "America/New_York";

export function etYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function etHourMinute(d: Date): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { h, m };
}

export function etWeekday(d: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "short" }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

function addCalendarDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0));
  return etYmd(dt);
}

/** Last US cash session date key (YYYY-MM-DD ET) to score for ABCD open drive. */
export function lastUsTradingSessionYmd(now = new Date()): string {
  let ymd = etYmd(now);
  let wd = etWeekday(now);
  const { h, m } = etHourMinute(now);
  const beforeOpen = h < 9 || (h === 9 && m < 30);

  if (beforeOpen || wd === 0 || wd === 6) {
    ymd = addCalendarDaysYmd(ymd, -1);
    wd = etWeekday(new Date(sessionOpenUtcMs(ymd) + 60_000));
    while (wd === 0 || wd === 6) {
      ymd = addCalendarDaysYmd(ymd, -1);
      wd = etWeekday(new Date(sessionOpenUtcMs(ymd) + 60_000));
    }
  } else if (wd === 0) {
    ymd = addCalendarDaysYmd(ymd, -2);
  } else if (wd === 6) {
    ymd = addCalendarDaysYmd(ymd, -1);
  }

  return ymd;
}

/** 09:30 America/New_York on `ymd` as UTC epoch ms. */
export function sessionOpenUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  let guess = Date.UTC(y, m - 1, d, 14, 30, 0);
  for (let i = 0; i < 96; i++) {
    const day = etYmd(new Date(guess));
    const { h, m: min } = etHourMinute(new Date(guess));
    if (day === ymd && h === 9 && min === 30) return guess;
    if (day > ymd || (day === ymd && (h > 9 || (h === 9 && min > 30)))) {
      guess -= 15 * 60 * 1000;
    } else {
      guess += 15 * 60 * 1000;
    }
  }
  return Date.UTC(y, m - 1, d, 13, 30, 0);
}

export function openDriveEndUtcMs(sessionYmd: string): number {
  return sessionOpenUtcMs(sessionYmd) + 30 * 60 * 1000;
}
