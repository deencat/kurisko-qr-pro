import type { LighterCandle } from "@/lib/lighter/client";

export type CapitalVolumeMode = "reported" | "synthetic";

/**
 * Capital.com CFD bars often omit or flatten `lastTradedVolume`.
 * Proxy volume from bar range so RVOL and volume-ratio gates work for S2–S9.
 */
export function synthesizeBarVolume(c: Pick<LighterCandle, "o" | "h" | "l" | "c">): number {
  const range = Math.max(c.h - c.l, 0);
  const body = Math.abs(c.c - c.o);
  const activity = range > 0 ? range : body;
  const price = c.c > 0 ? c.c : c.o;
  if (price <= 0) return 1;
  return Math.max((activity / price) * 1_000_000, 1);
}

export function capitalVolumeNote(mode: CapitalVolumeMode): string {
  if (mode === "synthetic") {
    return " Volume proxy from bar range (Capital CFD tick volume unreliable).";
  }
  return "";
}

/**
 * Capital CFD tick volume is sparse or flat — always use range-based proxy for backtests.
 */
export function ensureCapitalVolumes(candles: LighterCandle[]): {
  candles: LighterCandle[];
  volumeMode: CapitalVolumeMode;
} {
  if (!candles.length) return { candles, volumeMode: "reported" };
  return {
    candles: candles.map((c) => {
      const v = synthesizeBarVolume(c);
      return { ...c, v, V: v * c.c, volumeSynthetic: true };
    }),
    volumeMode: "synthetic",
  };
}
