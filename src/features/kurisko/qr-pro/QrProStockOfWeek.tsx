"use client";

import type { KuriskoSnapshot } from "@/lib/kurisko/snapshot/types";
import { QR_SYMBOL_META } from "./theme";

interface Props {
  snapshots: KuriskoSnapshot[];
}

/** Stock of the Week — highlights top K1 setup from scan. */
export function QrProStockOfWeek({ snapshots }: Props) {
  const top =
    snapshots.find((s) => s.stage === "SIGNAL") ??
    snapshots.find((s) => s.stage === "CONFIRM") ??
    snapshots.find((s) => s.stage === "DIV") ??
    snapshots[0];

  if (!top) {
    return (
      <div className="rounded border border-slate-700/80 bg-[#0a1628] p-3">
        <p className="text-[10px] font-black uppercase text-slate-500">Stock of the Week</p>
        <p className="mt-2 text-[10px] text-slate-600">Waiting for scan…</p>
      </div>
    );
  }

  const meta = QR_SYMBOL_META[top.symbol];
  const bias = top.side === "long" ? "BULLISH" : "BEARISH";
  const biasClass = top.side === "long" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400";

  return (
    <div className="rounded border border-slate-700/80 bg-[#0a1628] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase text-amber-300">Stock of the Week</p>
        <span className={`rounded px-1.5 py-0.5 text-[8px] font-black ${biasClass}`}>{bias}</span>
      </div>
      <p className="text-sm font-black text-white">
        {meta?.qrAlias ?? top.symbol}{" "}
        <span className="text-[10px] font-normal text-slate-500">({meta?.name})</span>
      </p>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        K1 stage <span className="font-bold text-white">{top.stage}</span> on {top.executionResolution} with{" "}
        {top.passCount}/{top.totalSteps} criteria. Structure quad momentum{" "}
        <span className="text-cyan-300">{top.vortexFlux.label}</span> ({top.vortexFlux.score}).{" "}
        {top.channelValid
          ? `Active ${top.channelDirection} channel — watch ${top.side} continuation.`
          : "No locked channel — waiting for 1-2-3 structure."}
      </p>
    </div>
  );
}
