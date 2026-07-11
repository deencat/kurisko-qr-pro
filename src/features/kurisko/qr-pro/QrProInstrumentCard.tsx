"use client";

import type { KuriskoMatrix, KuriskoSnapshot } from "@/lib/kurisko/snapshot/types";
import { QrProDepthBars } from "./QrProDepthBars";
import { QR_SYMBOL_META, STAGE_BADGE, formatQrPrice, stageBadgeLabel } from "./theme";
import { stageRank } from "@/lib/kurisko/snapshot/k1-stage";

interface Props {
  snapshot: KuriskoSnapshot;
  matrix: KuriskoMatrix | null;
  selected?: boolean;
  onSelect?: (symbol: string) => void;
}

function secondsAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  return `updated ${s}s ago`;
}

function bestMatrixStage(matrix: KuriskoMatrix | null): {
  tf: string;
  stage: KuriskoSnapshot["stage"];
  side: "long" | "short";
} | null {
  if (!matrix?.rows.length) return null;
  const sorted = [...matrix.rows].sort((a, b) => stageRank(a.stage) - stageRank(b.stage));
  const top = sorted[0]!;
  return { tf: top.timeframe, stage: top.stage, side: top.side };
}

export function QrProInstrumentCard({ snapshot, matrix, selected, onSelect }: Props) {
  const meta = QR_SYMBOL_META[snapshot.symbol] ?? {
    short: snapshot.symbol,
    name: snapshot.symbol,
    qrAlias: snapshot.symbol,
  };

  const best = bestMatrixStage(matrix);
  const badgeTf = best?.tf ?? snapshot.executionResolution;
  const badgeStage = best?.stage ?? snapshot.stage;
  const badgeSide = best?.side ?? snapshot.side;
  const badge = stageBadgeLabel(badgeStage, badgeSide, badgeTf);

  const tfCells: { tf: string; label: string; stage: KuriskoSnapshot["stage"] }[] = (matrix?.rows ?? []).map(
    (row) => ({
      tf: row.timeframe,
      label: row.stage === "WATCHING" ? "WATCHING" : stageBadgeLabel(row.stage, row.side, row.timeframe),
      stage: row.stage,
    })
  );

  while (tfCells.length < 3) {
    tfCells.push({ tf: ["1m", "3m", "5m"][tfCells.length] ?? "—", label: "WATCHING", stage: "WATCHING" });
  }

  return (
    <button
      type="button"
      onClick={() => onSelect?.(snapshot.symbol)}
      className={`flex w-full flex-col overflow-hidden rounded border text-left shadow-sm transition ${
        selected ? "border-cyan-400/80 ring-1 ring-cyan-400/50" : "border-slate-700/80"
      }`}
    >
      <div className="flex items-start justify-between gap-1 bg-white px-2 py-1.5 text-slate-900">
        <div className="min-w-0">
          <p className="text-sm font-black leading-tight">
            {meta.qrAlias}{" "}
            <span className="text-[9px] font-semibold text-slate-500">({meta.short})</span>
          </p>
          <p className="truncate text-[8px] text-slate-500">{meta.name}</p>
          <p className="text-[7px] text-slate-400">{secondsAgo(snapshot.scannedAt)}</p>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[7px] font-bold uppercase leading-tight ${STAGE_BADGE[badgeStage]}`}
        >
          {badge}
        </span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-800 bg-[#0d1b2a]">
        {tfCells.slice(0, 3).map((cell) => (
          <div key={cell.tf} className="px-1 py-1.5 text-center">
            <p className="text-[7px] font-bold uppercase text-slate-500">{cell.tf}</p>
            <p
              className={`mt-0.5 text-[8px] font-semibold leading-tight ${
                cell.stage === "WATCHING"
                  ? "text-slate-500"
                  : cell.stage === "SIGNAL"
                    ? "text-emerald-400"
                    : "text-amber-300"
              }`}
            >
              {cell.label.length > 16 ? cell.stage : cell.label}
            </p>
          </div>
        ))}
      </div>

      <div className="relative bg-[#0a1628] px-2 py-2">
        <QrProDepthBars depths={snapshot.depthExec} side={snapshot.side} />
        <p className="absolute bottom-1.5 right-2 font-mono text-xs font-bold text-slate-100">
          {formatQrPrice(snapshot.price)}
        </p>
      </div>
    </button>
  );
}
