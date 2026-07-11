import { KURISKO_STOCH_PARAMS, KURISKO_STOCH_THRESH_OVERBOUGHT, KURISKO_STOCH_THRESH_OVERSOLD } from "../constants";
import type { KuriskoQuadDepthBar, KuriskoQuadDepths, KuriskoQuadValues } from "./types";

const STOCH_LABELS: Record<keyof KuriskoQuadValues, string> = {
  A: "9-3",
  B: "14-3",
  C: "34-3",
  D: "60-10",
};

function depthForValue(value: number, side: "long" | "short"): { depth: number; inZone: boolean } {
  if (side === "long") {
    const inZone = value < KURISKO_STOCH_THRESH_OVERSOLD;
    const depth = inZone ? Math.min(100, Math.round(((KURISKO_STOCH_THRESH_OVERSOLD - value) / KURISKO_STOCH_THRESH_OVERSOLD) * 100)) : 0;
    return { depth, inZone };
  }
  const inZone = value > KURISKO_STOCH_THRESH_OVERBOUGHT;
  const depth = inZone
    ? Math.min(100, Math.round(((value - KURISKO_STOCH_THRESH_OVERBOUGHT) / (100 - KURISKO_STOCH_THRESH_OVERBOUGHT)) * 100))
    : 0;
  return { depth, inZone };
}

/** QR Pro-style horizontal depth bars for quad stochastics. */
export function computeQuadDepths(quad: KuriskoQuadValues, side: "long" | "short"): KuriskoQuadDepths {
  const keys = KURISKO_STOCH_PARAMS.map((p) => p.key);
  const bars: KuriskoQuadDepthBar[] = keys.map((key) => {
    const value = quad[key];
    const { depth, inZone } = depthForValue(value, side);
    return { key, label: STOCH_LABELS[key], value, depth, inZone };
  });

  let deepest: keyof KuriskoQuadValues | null = null;
  let deepestDepth = 0;
  for (const bar of bars) {
    if (bar.depth > deepestDepth) {
      deepestDepth = bar.depth;
      deepest = bar.key;
    }
  }

  return {
    bars,
    deepest,
    deepestDepth,
    allInZone: bars.every((b) => b.inZone),
  };
}

export function quadSnippet(quad: KuriskoQuadValues): string {
  return `9-3 ${quad.A.toFixed(0)} · 14-3 ${quad.B.toFixed(0)}`;
}
