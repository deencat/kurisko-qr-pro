import { etHourMinute, etYmd } from "@/lib/aziz/scan/session-et";

/** Global liquidity sessions (US Eastern), Trade-By-Design style. */
export type GlobalSessionId = "asia" | "uk" | "us" | "dead_gap";

export type AzizSessionPolicy = "all" | "respect_calendar";

const OPEN_DRIVE_MINUTES = 30;
const SESSION_WIND_DOWN_MINUTES = 60;

interface SessionDef {
  id: Exclude<GlobalSessionId, "dead_gap">;
  startMin: number;
  endMin: number;
}

/** Priority when sessions overlap: US > UK > Asia */
const SESSION_DEFS: SessionDef[] = [
  { id: "us", startMin: 9 * 60 + 30, endMin: 17 * 60 },
  { id: "uk", startMin: 3 * 60 + 30, endMin: 11 * 60 + 30 },
  { id: "asia", startMin: 19 * 60, endMin: 4 * 60 },
];

function minutesSinceMidnightEt(d: Date): number {
  const { h, m } = etHourMinute(d);
  return h * 60 + m;
}

function inMinuteRange(min: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return min >= start && min < end;
  return min >= start || min < end;
}

export function getGlobalSessionAt(d = new Date()): GlobalSessionId {
  const min = minutesSinceMidnightEt(d);
  for (const s of SESSION_DEFS) {
    if (inMinuteRange(min, s.startMin, s.endMin)) return s.id;
  }
  return "dead_gap";
}

function getSessionDef(id: Exclude<GlobalSessionId, "dead_gap">): SessionDef {
  return SESSION_DEFS.find((s) => s.id === id)!;
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0));
  return etYmd(dt);
}

function findSessionStartUtcMs(ymd: string, targetMin: number): number {
  const [y, mo, d] = ymd.split("-").map(Number);
  let guess = Date.UTC(y, mo - 1, d, 12, 0, 0);
  for (let i = 0; i < 96; i++) {
    if (etYmd(new Date(guess)) !== ymd) {
      guess += guess < Date.UTC(y, mo - 1, d, 12, 0, 0) ? 15 * 60 * 1000 : -15 * 60 * 1000;
      continue;
    }
    if (minutesSinceMidnightEt(new Date(guess)) === targetMin) return guess;
    guess += 5 * 60 * 1000;
  }
  return guess;
}

export function getSessionOpenDriveWindow(
  sessionId: Exclude<GlobalSessionId, "dead_gap">,
  ref = new Date()
): { startMs: number; endMs: number; label: string } {
  const ymd = etYmd(ref);
  const def = getSessionDef(sessionId);
  let anchorYmd = ymd;
  if (sessionId === "asia" && minutesSinceMidnightEt(ref) < def.endMin) {
    anchorYmd = addDaysYmd(ymd, -1);
  }
  const startMs = findSessionStartUtcMs(anchorYmd, def.startMin);
  const endMs = startMs + OPEN_DRIVE_MINUTES * 60 * 1000;
  return {
    startMs,
    endMs,
    label: `${sessionId.toUpperCase()} open drive (${OPEN_DRIVE_MINUTES}m)`,
  };
}

export function getActiveOpenDriveWindow(ref = new Date()): {
  session: GlobalSessionId;
  startMs: number;
  endMs: number;
  label: string;
} {
  const session = getGlobalSessionAt(ref);
  if (session === "dead_gap") {
    const endMs = ref.getTime();
    return {
      session,
      startMs: endMs - OPEN_DRIVE_MINUTES * 60 * 1000,
      endMs,
      label: "Dead gap — last 30m (algo)",
    };
  }

  const def = getSessionDef(session);
  const min = minutesSinceMidnightEt(ref);
  const driveStart = def.startMin;
  const driveEnd = driveStart + OPEN_DRIVE_MINUTES;
  const inDrive =
    driveEnd <= 24 * 60
      ? inMinuteRange(min, driveStart, driveEnd)
      : min >= driveStart || min < driveEnd % (24 * 60);

  if (inDrive) {
    const drive = getSessionOpenDriveWindow(session, ref);
    return { session, ...drive };
  }

  const endMs = ref.getTime();
  return {
    session,
    startMs: endMs - OPEN_DRIVE_MINUTES * 60 * 1000,
    endMs,
    label: `${session.toUpperCase()} — last ${OPEN_DRIVE_MINUTES}m (algo)`,
  };
}

export function isDeadGapAt(d: Date): boolean {
  return getGlobalSessionAt(d) === "dead_gap";
}

export function isSessionWindDownAt(d: Date): boolean {
  const session = getGlobalSessionAt(d);
  if (session === "dead_gap") return true;
  const min = minutesSinceMidnightEt(d);
  const def = getSessionDef(session);
  if (def.startMin < def.endMin) {
    return min >= def.endMin - SESSION_WIND_DOWN_MINUTES;
  }
  const adj = min < def.endMin ? min + 24 * 60 : min;
  const endAdj = def.endMin + 24 * 60;
  return adj >= endAdj - SESSION_WIND_DOWN_MINUTES;
}

export function isAbcdEntryAllowedAt(d: Date, policy: AzizSessionPolicy = "all"): boolean {
  if (policy === "all") return true;
  if (isDeadGapAt(d)) return false;
  if (isSessionWindDownAt(d)) return false;
  return true;
}

export const GLOBAL_SESSION_LABELS: Record<GlobalSessionId, string> = {
  asia: "Asia",
  uk: "UK / Europe",
  us: "US",
  dead_gap: "Dead gap",
};
