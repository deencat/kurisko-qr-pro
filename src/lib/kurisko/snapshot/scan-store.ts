import "server-only";

import type { AzizSipScanResult } from "@/lib/aziz/scan/sip-types";
import type {
  KuriskoLevelsResponse,
  KuriskoMatrix,
  KuriskoScanFeed,
  KuriskoScanResult,
} from "./types";

interface ScanStoreState {
  scan: KuriskoScanResult | null;
  matrices: Record<string, KuriskoMatrix | null>;
  levels: KuriskoLevelsResponse | null;
  gapScan: AzizSipScanResult | null;
  premarket: AzizSipScanResult | null;
  scanning: boolean;
  lastCompletedAt: number | null;
}

const STORE_KEY = "__kuriskoScanStore";

function createEmptyState(): ScanStoreState {
  return {
    scan: null,
    matrices: {},
    levels: null,
    gapScan: null,
    premarket: null,
    scanning: false,
    lastCompletedAt: null,
  };
}

/** Shared across instrumentation + route bundles in standalone builds. */
function getState(): ScanStoreState {
  const root = globalThis as typeof globalThis & { [STORE_KEY]?: ScanStoreState };
  root[STORE_KEY] ??= createEmptyState();
  return root[STORE_KEY]!;
}

const DEFAULT_STALE_MS = 90_000;

export function setScanInProgress(scanning: boolean): void {
  getState().scanning = scanning;
}

export function setCachedScan(
  scan: KuriskoScanResult,
  matrices: Record<string, KuriskoMatrix | null>
): void {
  const state = getState();
  state.scan = scan;
  state.matrices = matrices;
  state.lastCompletedAt = Date.now();
  state.scanning = false;
}

export function setCachedLevels(levels: KuriskoLevelsResponse): void {
  getState().levels = levels;
}

export function setCachedGapScan(result: AzizSipScanResult): void {
  getState().gapScan = result;
}

export function setCachedPremarket(result: AzizSipScanResult): void {
  getState().premarket = result;
}

export function getCachedMatrix(symbol: string): KuriskoMatrix | null {
  return getState().matrices[symbol.toUpperCase()] ?? null;
}

export function getCachedLevels(): KuriskoLevelsResponse | null {
  return getState().levels;
}

export function getCachedGapScan(): AzizSipScanResult | null {
  return getState().gapScan;
}

export function getCachedPremarket(): AzizSipScanResult | null {
  return getState().premarket;
}

export function getKuriskoScanFeed(staleMs = DEFAULT_STALE_MS): KuriskoScanFeed {
  const state = getState();
  const scannedAt = state.scan?.scannedAt ?? state.lastCompletedAt ?? 0;
  const stale = !state.scan || Date.now() - scannedAt > staleMs;

  return {
    scannedAt,
    symbols: state.scan?.symbols ?? [],
    results: state.scan?.results ?? [],
    buyCount: state.scan?.buyCount ?? 0,
    sellCount: state.scan?.sellCount ?? 0,
    ...(state.scan?.errors?.length ? { errors: state.scan.errors } : {}),
    matrices: state.matrices,
    scanning: state.scanning,
    stale,
  };
}

export function isScanInProgress(): boolean {
  return getState().scanning;
}
