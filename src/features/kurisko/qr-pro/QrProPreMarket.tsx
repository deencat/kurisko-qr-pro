"use client";

import { useCallback, useEffect, useState } from "react";
import type { AzizSipScanResult, AzizSipScanRow } from "@/lib/aziz/scan/sip-types";
import { QrProWidgetCard } from "./QrProWidgetCard";

function PreMarketTable({ rows }: { rows: AzizSipScanRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[8px]">
        <thead>
          <tr className="border-b border-slate-700 text-slate-500">
            <th className="py-0.5 pr-1 font-bold">SYM</th>
            <th className="py-0.5 pr-1 font-bold">PRICE</th>
            <th className="py-0.5 pr-1 font-bold">CHG%</th>
            <th className="py-0.5 pr-1 font-bold">RVOL</th>
            <th className="py-0.5 font-bold">SRC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const chg = row.changePct ?? row.gapPct;
            return (
              <tr key={row.symbol} className="border-b border-slate-800/60 font-mono">
                <td className="py-0.5 pr-1 font-bold text-white">{row.symbol}</td>
                <td className="py-0.5 pr-1 text-slate-300">{row.price.toFixed(2)}</td>
                <td className={`py-0.5 pr-1 ${chg >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {chg >= 0 ? "+" : ""}
                  {chg.toFixed(1)}
                </td>
                <td className="py-0.5 pr-1 text-slate-400">{row.rvol.toFixed(1)}x</td>
                <td className="max-w-[48px] truncate py-0.5 text-slate-500">{row.moverSource ?? "vol"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function QrProPreMarket() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AzizSipScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kurisko/premarket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxSymbols: 6 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Pre-market scan failed");
      setResult(data as AzizSipScanResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pre-market scan failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const rows = [...(result?.results ?? [])].sort(
    (a, b) => Math.abs(b.changePct ?? b.gapPct) - Math.abs(a.changePct ?? a.gapPct)
  );

  return (
    <QrProWidgetCard
      title="Pre-Market Poppers"
      subtitle="Volatile movers · Capital.com"
      headerClass="bg-rose-900 text-white"
      loading={loading}
    >
      {error ? <p className="text-[9px] text-rose-400">{error}</p> : null}
      {!error && rows.length === 0 && !loading ? (
        <p className="text-[9px] text-slate-500">No volatile movers.</p>
      ) : (
        <PreMarketTable rows={rows.slice(0, 5)} />
      )}
    </QrProWidgetCard>
  );
}
