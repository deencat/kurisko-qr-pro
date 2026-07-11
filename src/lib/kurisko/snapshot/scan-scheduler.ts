import "server-only";

import { runKuriskoScan } from "./run-scheduled-scan";
import { isScanInProgress } from "./scan-store";

const DEFAULT_INTERVAL_MS = 60_000;
const LEVELS_EVERY_N_TICKS = 5;

let started = false;
let tickCount = 0;
let timer: ReturnType<typeof setInterval> | null = null;

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

  tickCount += 1;
  const includeLevels = tickCount === 1 || tickCount % LEVELS_EVERY_N_TICKS === 0;

  try {
    await runKuriskoScan({ includeWidgets: true, includeLevels });
  } catch (error) {
    console.error("[kurisko-scan] scheduled tick failed:", error);
  }
}

/** Start a single in-process scan loop. Safe to call once per Node process. */
export function startKuriskoScanScheduler(): void {
  if (started || !scanEnabled()) return;
  started = true;

  const intervalMs = scanIntervalMs();
  console.info(`[kurisko-scan] scheduler started (interval=${intervalMs}ms)`);

  void runTick();
  timer = setInterval(() => void runTick(), intervalMs);
  timer.unref?.();
}

export function stopKuriskoScanScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
