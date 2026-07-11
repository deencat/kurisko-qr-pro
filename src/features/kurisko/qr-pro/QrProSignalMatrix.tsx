"use client";

import type { KuriskoK1Stage, KuriskoMatrix, KuriskoMatrixRow } from "@/lib/kurisko/snapshot/types";
import { QrProDepthBars } from "./QrProDepthBars";
import { QR_SYMBOLS, QR_SYMBOL_META, STAGE_BADGE, stageBadgeLabel } from "./theme";

interface Props {
  matrices: Record<string, KuriskoMatrix | null>;
  loading?: boolean;
}

const TIMEFRAMES = ["1m", "3m", "5m"] as const;

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function stageTopBadge(stage: KuriskoK1Stage, side: "long" | "short", tf: string): string {
  if (stage === "WATCHING") return "— WATCHING —";
  return stageBadgeLabel(stage, side, tf);
}

function depthBadgeClass(depth: number): string {
  if (depth >= 40) return "bg-rose-600/30 text-rose-300";
  return "bg-slate-600/40 text-slate-300";
}

function MatrixCell({ row, scannedAt }: { row: KuriskoMatrixRow | null; scannedAt?: number }) {
  if (!row) {
    return (
      <div className="flex min-h-[148px] flex-col rounded border border-dashed border-slate-800 bg-[#0d1b2a]/50 px-2 py-2">
        <span className="mx-auto rounded border border-slate-500 bg-white px-2 py-0.5 text-[9px] font-semibold text-slate-600">
          — WATCHING —
        </span>
        <p className="mt-auto text-center text-[9px] text-slate-600">No data</p>
      </div>
    );
  }

  const bull = row.bias === "BULL";
  const depth = row.depths.deepestDepth;
  const ts = row.barTs || scannedAt || Date.now();

  return (
    <div className="flex min-h-[148px] flex-col rounded border border-slate-800 bg-[#0d1b2a] px-2 py-2">
      <span
        className={`mx-auto rounded border px-2 py-0.5 text-[9px] font-bold uppercase leading-tight ${
          row.stage === "WATCHING"
            ? "border-slate-400 bg-white text-slate-700"
            : `border-transparent ${STAGE_BADGE[row.stage]}`
        }`}
      >
        {stageTopBadge(row.stage, row.side, row.timeframe)}
      </span>

      <div className="mt-2 flex-1">
        <QrProDepthBars depths={row.depths} side={row.side} thick />
      </div>

      <div className="mt-2 flex items-center justify-between gap-1">
        <div className="flex flex-wrap gap-1">
          <span
            className={`rounded px-1.5 py-0.5 text-[8px] font-black ${
              bull ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
            }`}
          >
            {bull ? "▲ BULL" : "▼ BEAR"}
          </span>
          {depth > 0 ? (
            <span className={`rounded px-1.5 py-0.5 text-[8px] font-black ${depthBadgeClass(depth)}`}>
              DEPTH {depth}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 text-[8px] text-slate-500">{timeAgo(ts)}</span>
      </div>
    </div>
  );
}

export function QrProSignalMatrix({ matrices, loading }: Props) {
  return (
    <section className="overflow-hidden rounded border border-slate-700/80 bg-[#0a1628]">
      <div className="border-b border-slate-700 bg-[#0d1b2a] px-3 py-2">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-cyan-300">
          Signal Matrix — ES · NQ · GC · BTC · YM × 1m · 3m · 5m
        </h2>
      </div>

      {loading && Object.keys(matrices).length === 0 ? (
        <p className="p-4 text-xs text-slate-500">Building matrix…</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-700 bg-[#0d1b2a] text-[9px] font-black uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 text-left">Instrument</th>
              {TIMEFRAMES.map((tf) => (
                <th key={tf} className="px-2 py-2 text-center">
                  {tf}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {QR_SYMBOLS.map((sym) => {
              const matrix = matrices[sym];
              const meta = QR_SYMBOL_META[sym];
              const alias = meta?.qrAlias ?? sym;
              const name = meta?.name ?? sym;

              return (
                <tr key={sym} className="bg-[#0a1628]">
                  <td className="px-3 py-3 align-top">
                    <p className="text-sm font-black text-white">{alias}</p>
                    <p className="text-[9px] text-slate-500">{name}</p>
                  </td>
                  {TIMEFRAMES.map((tf) => {
                    const row = matrix?.rows.find((r) => r.timeframe === tf) ?? null;
                    return (
                      <td key={`${sym}-${tf}`} className="px-2 py-2 align-top">
                        <MatrixCell row={row} scannedAt={matrix?.scannedAt} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
