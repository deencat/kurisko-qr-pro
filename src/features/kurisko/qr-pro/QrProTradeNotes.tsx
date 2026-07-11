"use client";

import type { KuriskoFearGreed, KuriskoSnapshot } from "@/lib/kurisko/snapshot/types";

interface Props {
  snapshots: KuriskoSnapshot[];
  fearGreed?: KuriskoFearGreed | null;
}

export function QrProTradeNotes({ snapshots, fearGreed }: Props) {
  const signals = snapshots.filter((s) => s.stage === "SIGNAL" || s.stage === "CONFIRM");
  const armed = snapshots.filter((s) => s.stage === "ARM" || s.stage === "STAGE1");
  const date = new Date().toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push(
    `Big Picture: Fear & Greed at ${fearGreed?.value ?? "—"} (${fearGreed?.classification ?? "loading"}). ` +
      `${signals.length} active signal(s), ${armed.length} armed setup(s) across ES/NQ/GC/BTC/YM.`
  );

  if (signals.length) {
    lines.push(
      `Active: ${signals.map((s) => `${s.symbol} ${s.side.toUpperCase()} @ ${s.stage}`).join("; ")}.`
    );
  } else if (armed.length) {
    lines.push(
      `Watching: ${armed.map((s) => `${s.symbol} ${s.stage} (${s.side})`).join("; ")} — track deepest quad embed.`
    );
  } else {
    lines.push("No CONFIRM/SIGNAL setups — stay patient, let quad rotation complete on structure TF.");
  }

  const aboveVwap = snapshots.filter((s) => s.marketContext?.aboveVwap).length;
  lines.push(
    `Breadth: ${aboveVwap}/${snapshots.length} symbols above session VWAP. ` +
      "Use gap scanner for stock picks; K1 CFD scan for index/commodity entries."
  );

  return (
    <div className="flex h-full flex-col rounded border border-slate-700/80 bg-[#0a1628]">
      <div className="border-b border-slate-700 bg-[#0d1b2a] px-3 py-1.5">
        <h3 className="text-[10px] font-black uppercase tracking-wide text-slate-300">Trade Notes</h3>
        <p className="text-[8px] text-slate-500">{date}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <p className="mb-2 text-[9px] font-bold uppercase text-amber-400/90">Big Picture</p>
        {lines.map((line, i) => (
          <p key={i} className="mb-2 text-[10px] leading-relaxed text-slate-400">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
