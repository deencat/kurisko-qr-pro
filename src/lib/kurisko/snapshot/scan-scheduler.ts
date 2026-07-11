import "server-only";

import { runKuriskoScan } from "./run-scheduled-scan";
import { isScanInProgress } from "./scan-store";

const DEFAULT_INTERVAL_MS = 60_000;
const LEVELS_EVERY_N_TICKS = 5;

const SCHEDULER_KEY = "__kuriskoScanScheduler";

interface SchedulerState {
  started: boolean;
  tickCount: number;
  timer: ReturnType<typeof setInterval> | null;
}

function getSchedulerState(): SchedulerState {
  const root = globalThis as typeof globalThis & { [SCHEDULER_KEY]?: SchedulerState };
  root[SCHEDULER_KEY] ??= { started: false, tickCount: 0, timer: null };
  return root[SCHEDULER_KEY]!;
}

function scanIntervalMs(): number {
  const raw = process.env.KURISKO_SCAN_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 15_000 ? parsed : DEFAULT_INTERVAL_MS;
}

function scanEnabled(): boolean {
  const flag = process.env.KURISKO_SCAN_ENABLED;
  if (flag == null) return true;
  return flag !== "0" && flag.toLowerCase() !== "false";
}

async function runTick(): Promise<void> {
  if (isScanInProgress()) return;

  const scheduler = getSchedulerState();
  scheduler.tickCount += 1;
  const includeLevels =
    scheduler.tickCount === 1 || scheduler.tickCount % LEVELS_EVERY_N_TICKS === 0;

  try {
    const result = await runKuriskoScan({ includeWidgets: true, includeLevels });
    console.info(
      `[kurisko-scan] tick ${scheduler.tickCount} completed (${result.results.length} symbols)`
    );
  } catch (error) {
    console.error("[kurisko-scan] scheduled tick failed:", error);
  }
}

/** Start a single in-process scan loop. Safe to call once per Node process. */
export function startKuriskoScanScheduler(): void {
  const scheduler = getSchedulerState();
  if (scheduler.started || !scanEnabled()) return;
  scheduler.started = true;

  const intervalMs = scanIntervalMs();
  console.info(`[kurisko-scan] scheduler started (interval=${intervalMs}ms)`);

  void runTick();
  scheduler.timer = setInterval(() => void runTick(), intervalMs);
  scheduler.timer.unref?.();
}

export function stopKuriskoScanScheduler(): void {
  const scheduler = getSchedulerState();
  if (scheduler.timer) clearInterval(scheduler.timer);
  scheduler.timer = null;
  scheduler.started = false;
}
