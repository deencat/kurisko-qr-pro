"use client";

import type { KuriskoMatrix } from "@/lib/kurisko/snapshot/types";
import { QrProDepthBars } from "./QrProDepthBars";
import { QR_SYMBOLS, QR_SYMBOL_META } from "./theme";

interface Props {
  matrices: Record<string, KuriskoMatrix | null>;
  loading?: boolean;
}

const TIMEFRAMES = ["1m", "3m", "5m"] as const;

export function QrProSignalMatrix({ matrices, loading }: Props) {
  const symbols = QR_SYMBOLS.filter((s) => matrices[s]);

  return (
    <section className="overflow-hidden rounded border border-slate-700/80 bg-[#0a1628]">
      <div className="border-b border-slate-700 bg-[#0d1b2a] px-3 py-2">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-cyan-300">
          Signal Matrix — ES · NQ · GC · BTC · YM × 1m · 3m · 5m
        </h2>
      </div>

      {loading && symbols.length === 0 ? (
        <p className="p-4 text-xs text-slate-500">Building matrix…</p>
      ) : null}

      <div className="divide-y divide-slate-800">
        {TIMEFRAMES.map((tf) => (
          <div key={tf} className="px-2 py-2">
            <p className="mb-2 text-[10px] font-black uppercase text-slate-400">{tf}</p>
            <div className="space-y-2">
              {symbols.map((sym) => {
                const matrix = matrices[sym];
                const row = matrix?.rows.find((r) => r.timeframe === tf);
                const meta = QR_SYMBOL_META[sym];
                const alias = meta?.qrAlias ?? sym;

                if (!row || row.stage === "WATCHING") {
                  return (
                    <div
                      key={`${tf}-${sym}`}
                      className="flex items-center gap-3 rounded border border-dashed border-slate-800 px-3 py-2"
                    >
                      <span className="w-8 text-xs font-black text-slate-500">{alias}</span>
                      <span className="flex-1 text-center text-[10px] text-slate-600">— WATCHING —</span>
                    </div>
                  );
                }

                const depth = row.depths.deepestDepth;
                const bull = row.bias === "BULL";

                return (
                  <div key={`${tf}-${sym}`} className="rounded border border-slate-800 bg-[#0d1b2a] px-2 py-2">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-white">{alias}</span>
                      <div className="flex gap-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[8px] font-black ${
                            bull ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                          }`}
                        >
                          {bull ? "▲ BULL" : "▼ BEAR"}
                        </span>
                        {depth > 0 ? (
                          <span className="rounded bg-rose-600/30 px-1.5 py-0.5 text-[8px] font-black text-rose-300">
                            DEPTH {depth}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <QrProDepthBars depths={row.depths} side={row.side} thick />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
