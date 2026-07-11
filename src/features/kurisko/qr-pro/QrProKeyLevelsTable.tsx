"use client";

import { useEffect, useState } from "react";
import type { KuriskoLevelsResponse, KuriskoSymbolLevels } from "@/lib/kurisko/snapshot/types";
import { QrProWidgetCard } from "./QrProWidgetCard";
import { formatQrPrice } from "./theme";

const ROWS: { key: keyof KuriskoSymbolLevels; label: string; color: string }[] = [
  { key: "todayHi", label: "TODAY HI", color: "text-rose-400" },
  { key: "todayLo", label: "TODAY LO", color: "text-emerald-400" },
  { key: "pivot", label: "PIVOT", color: "text-violet-300" },
  { key: "prevDay", label: "PREV DAY", color: "text-slate-300" },
  { key: "prevHi", label: "PREV HI", color: "text-rose-300" },
  { key: "prevCls", label: "PREV CLS", color: "text-slate-400" },
  { key: "prevLo", label: "PREV LO", color: "text-emerald-300" },
  { key: "athFib", label: "ATH FIBS", color: "text-amber-300" },
];

export function QrProKeyLevelsTable() {
  const [levels, setLevels] = useState<KuriskoSymbolLevels[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/kurisko/levels");
        if (res.ok) {
          const data = (await res.json()) as KuriskoLevelsResponse;
          setLevels(data.symbols);
        }
      } catch {
        /* non-fatal */
      } finally {
        setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 5 * 60_000);
    return () => window.clearInterval(id);
  }, []);

  const cols = levels.length ? levels : [];

  return (
    <QrProWidgetCard title="Key Levels" headerClass="bg-teal-800 text-white" loading={loading}>
      {cols.length === 0 ? (
        <p className="text-[9px] text-slate-500">Loading levels…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[7px]">
            <thead>
              <tr className="border-b border-slate-700 text-slate-500">
                <th className="py-0.5 pr-1 text-left font-bold" />
                {cols.map((c) => (
                  <th key={c.symbol} className="px-0.5 py-0.5 text-center font-black text-white">
                    {c.qrAlias}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key} className="border-b border-slate-800/50 font-mono">
                  <td className={`py-0.5 pr-1 font-bold ${row.color}`}>{row.label}</td>
                  {cols.map((c) => {
                    const val = c[row.key];
                    const display =
                      val == null ? "—" : typeof val === "number" ? formatQrPrice(val) : String(val);
                    return (
                      <td key={`${c.symbol}-${row.key}`} className={`px-0.5 py-0.5 text-center ${row.color}`}>
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </QrProWidgetCard>
  );
}
