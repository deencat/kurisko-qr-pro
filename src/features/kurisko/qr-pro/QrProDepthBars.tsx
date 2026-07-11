"use client";

import type { KuriskoQuadDepths } from "@/lib/kurisko/snapshot/types";
import { QR_STOCH_DISPLAY, stochBarColor } from "./theme";

interface Props {
  depths: KuriskoQuadDepths;
  side: "long" | "short";
  showLabels?: boolean;
  thick?: boolean;
}

/** QR Pro horizontal quad bars — value-colored like reference screenshot. */
export function QrProDepthBars({ depths, showLabels = true, thick = false }: Props) {
  const h = thick ? "h-4" : "h-3";

  return (
    <div className={thick ? "space-y-1.5" : "space-y-1"}>
      {depths.bars.map((bar) => {
        const displayLabel = QR_STOCH_DISPLAY[bar.label] ?? bar.label;
        const width = Math.max(8, Math.min(100, bar.value));
        return (
          <div key={bar.key} className="flex items-center gap-1.5">
            {showLabels ? (
              <span className="w-9 shrink-0 text-right font-mono text-[9px] text-slate-400">{displayLabel}</span>
            ) : null}
            <div className={`relative flex-1 overflow-hidden rounded-sm bg-slate-800/80 ${h}`}>
              <div
                className={`h-full rounded-sm transition-all ${stochBarColor(bar.value)}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="w-7 shrink-0 text-right font-mono text-[9px] font-bold text-slate-300">
              {bar.value.toFixed(0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
