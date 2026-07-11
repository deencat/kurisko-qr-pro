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

const state: ScanStoreState = {
  scan: null,
  matrices: {},
  levels: null,
  gapScan: null,
  premarket: null,
  scanning: false,
  lastCompletedAt: null,
};

const DEFAULT_STALE_MS = 90_000;

export function setScanInProgress(scanning: boolean): void {
  state.scanning = scanning;
}

export function setCachedScan(
  scan: KuriskoScanResult,
  matrices: Record<string, KuriskoMatrix | null>
): void {
  state.scan = scan;
  state.matrices = matrices;
  state.lastCompletedAt = Date.now();
  state.scanning = false;
}

export function setCachedLevels(levels: KuriskoLevelsResponse): void {
  state.levels = levels;
}

export function setCachedGapScan(result: AzizSipScanResult): void {
  state.gapScan = result;
}

export function setCachedPremarket(result: AzizSipScanResult): void {
  state.premarket = result;
}

export function getCachedMatrix(symbol: string): KuriskoMatrix | null {
  return state.matrices[symbol.toUpperCase()] ?? null;
}

export function getCachedLevels(): KuriskoLevelsResponse | null {
  return state.levels;
}

export function getCachedGapScan(): AzizSipScanResult | null {
  return state.gapScan;
}

export function getCachedPremarket(): AzizSipScanResult | null {
  return state.premarket;
}

export function getKuriskoScanFeed(staleMs = DEFAULT_STALE_MS): KuriskoScanFeed {
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
  return state.scanning;
}
