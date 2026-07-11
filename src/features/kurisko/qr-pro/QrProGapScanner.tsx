"use client";

import { useCallback, useEffect, useState } from "react";
import type { AzizSipScanResult, AzizSipScanRow } from "@/lib/aziz/scan/sip-types";
import { QrProWidgetCard } from "./QrProWidgetCard";

function GapTable({ rows }: { rows: AzizSipScanRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[8px]">
        <thead>
          <tr className="border-b border-slate-700 text-slate-500">
            <th className="py-0.5 pr-1 font-bold">SYM</th>
            <th className="py-0.5 pr-1 font-bold">PRICE</th>
            <th className="py-0.5 pr-1 font-bold">GAP%</th>
            <th className="py-0.5 pr-1 font-bold">CHG%</th>
            <th className="py-0.5 pr-1 font-bold">VOL</th>
            <th className="py-0.5 font-bold">NAME</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.symbol} className="border-b border-slate-800/60 font-mono">
              <td className="py-0.5 pr-1 font-bold text-white">{row.symbol}</td>
              <td className="py-0.5 pr-1 text-slate-300">{row.price.toFixed(2)}</td>
              <td className={`py-0.5 pr-1 ${row.gapPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {row.gapPct >= 0 ? "+" : ""}
                {row.gapPct.toFixed(1)}
              </td>
              <td className={`py-0.5 pr-1 ${(row.changePct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {(row.changePct ?? row.gapPct) >= 0 ? "+" : ""}
                {(row.changePct ?? row.gapPct).toFixed(1)}
              </td>
              <td className="py-0.5 pr-1 text-slate-400">{row.rvol.toFixed(1)}x</td>
              <td className="max-w-[60px] truncate py-0.5 text-slate-500">{row.assetClass ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QrProGapScanner() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AzizSipScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kurisko/gap-scan");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gap scan failed");
      setResult(data as AzizSipScanResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gap scan failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const rows = result?.results ?? [];

  return (
    <QrProWidgetCard
      title="Gap Scanner"
      subtitle="$1–$100 · Gap >0.5% · 60s refresh"
      headerClass="bg-blue-700 text-white"
      loading={loading}
    >
      {error ? <p className="text-[9px] text-rose-400">{error}</p> : null}
      {!error && rows.length === 0 && !loading ? (
        <p className="text-[9px] text-slate-500">No gainers in scan window.</p>
      ) : (
        <GapTable rows={rows.slice(0, 6)} />
      )}
    </QrProWidgetCard>
  );
}
