"use client";

import { useMemo, useState } from "react";
import type { KuriskoChartCandle, KuriskoSnapshot, KuriskoSymbolLevels } from "@/lib/kurisko/snapshot/types";
import { QrProMiniChart } from "./QrProMiniChart";
import { QR_SYMBOL_META } from "./theme";

type ChartTf = "1m" | "3m" | "5m";

const LIVE_CHART_SYMBOLS = ["US500", "US100"] as const;
const TF_MS: Record<ChartTf, number> = { "1m": 60_000, "3m": 180_000, "5m": 300_000 };

function aggregateBars(bars: KuriskoChartCandle[], periodMs: number): KuriskoChartCandle[] {
  const buckets = new Map<number, KuriskoChartCandle>();
  for (const b of bars) {
    const bucket = Math.floor(b.t / periodMs) * periodMs;
    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, { ...b, t: bucket });
    } else {
      existing.h = Math.max(existing.h, b.h);
      existing.l = Math.min(existing.l, b.l);
      existing.c = b.c;
    }
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

interface Props {
  snapshots: KuriskoSnapshot[];
  levels: KuriskoSymbolLevels[];
}

export function QrProLiveCharts({ snapshots, levels }: Props) {
  const [tf, setTf] = useState<ChartTf>("1m");
  const [expanded, setExpanded] = useState<string | null>(null);

  const levelMap = useMemo(() => new Map(levels.map((l) => [l.symbol, l])), [levels]);

  const chartSnapshots = LIVE_CHART_SYMBOLS.map(
    (sym) => snapshots.find((s) => s.symbol === sym) ?? null
  ).filter(Boolean) as KuriskoSnapshot[];

  return (
    <div className="overflow-hidden rounded border border-slate-700/80 bg-[#0a1628]">
      <div className="flex items-center justify-between border-b border-slate-700 bg-[#0d1b2a] px-3 py-1.5">
        <h3 className="text-[10px] font-black uppercase tracking-wider text-cyan-300">Live Charts</h3>
        <div className="flex gap-1">
          {(["1m", "3m", "5m"] as ChartTf[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTf(t)}
              className={`rounded px-2 py-0.5 text-[8px] font-bold uppercase ${
                tf === t ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px bg-slate-800 md:grid-cols-2">
        {chartSnapshots.map((s) => {
          const meta = QR_SYMBOL_META[s.symbol];
          const symLevels = levelMap.get(s.symbol);
          const bars =
            tf === "1m" ? s.chartBars : aggregateBars(s.chartBars ?? [], TF_MS[tf]);

          return (
            <div key={s.symbol} className="relative bg-[#0a1628] p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-black text-white">{meta?.qrAlias ?? s.symbol}</span>
                <button
                  type="button"
                  onClick={() => setExpanded(s.symbol)}
                  className="rounded border border-slate-600 px-1.5 py-0.5 text-[7px] font-bold text-slate-400 hover:text-white"
                >
                  EXPAND
                </button>
              </div>
              <QrProMiniChart
                bars={bars}
                keyLevels={s.keyLevels}
                pivot={symLevels?.pivot ?? null}
                height={140}
              />
            </div>
          );
        })}
      </div>

      {expanded ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setExpanded(null)}
          onKeyDown={() => {}}
          role="presentation"
        >
          <div
            className="w-full max-w-4xl rounded border border-slate-600 bg-[#0a1628] p-4"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={() => {}}
            role="presentation"
          >
            {(() => {
              const s = snapshots.find((x) => x.symbol === expanded);
              if (!s) return null;
              const symLevels = levelMap.get(s.symbol);
              const bars =
                tf === "1m" ? s.chartBars : aggregateBars(s.chartBars ?? [], TF_MS[tf]);
              return (
                <>
                  <p className="mb-2 text-sm font-black text-white">
                    {QR_SYMBOL_META[s.symbol]?.qrAlias ?? s.symbol} · {tf}
                  </p>
                  <QrProMiniChart
                    bars={bars}
                    keyLevels={s.keyLevels}
                    pivot={symLevels?.pivot ?? null}
                    showTimeScale
                    height={360}
                  />
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
