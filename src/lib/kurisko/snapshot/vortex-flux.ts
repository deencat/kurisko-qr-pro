import type { KuriskoQuadDepths, KuriskoQuadValues, KuriskoVortexFlux } from "./types";

/** QR Pro Vortexflux meter — structure-TF quad momentum vs setup side. */
export function computeVortexFlux(
  quad: KuriskoQuadValues,
  depths: KuriskoQuadDepths,
  side: "long" | "short"
): KuriskoVortexFlux {
  const values = [quad.A, quad.B, quad.C, quad.D];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const zoneDepth = depths.deepestDepth;

  let momentum: number;
  if (side === "long") {
    momentum = Math.round(Math.min(100, Math.max(-100, (50 - avg) * 2 + zoneDepth * 0.35)));
  } else {
    momentum = Math.round(Math.min(100, Math.max(-100, (avg - 50) * 2 + zoneDepth * 0.35)));
  }

  const score = Math.round(Math.min(100, Math.max(0, 50 + momentum / 2)));

  let label: KuriskoVortexFlux["label"] = "NEUTRAL";
  if (momentum >= 25) label = "BULL";
  else if (momentum <= -25) label = "BEAR";

  return { score, label, momentum };
}
