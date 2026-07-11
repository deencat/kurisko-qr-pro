"use client";

import { useEffect, useState } from "react";
import type { KuriskoEconomicCalendar, KuriskoFearGreed } from "@/lib/kurisko/snapshot/types";
import { QrProSemiGauge } from "./QrProSemiGauge";
import { QrProWidgetCard } from "./QrProWidgetCard";

function formatEventTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function QrProFearGreedGauge() {
  const [data, setData] = useState<KuriskoFearGreed | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/kurisko/fear-greed");
        if (res.ok) setData((await res.json()) as KuriskoFearGreed);
      } catch {
        /* non-fatal */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 15 * 60_000);
    return () => window.clearInterval(id);
  }, []);

  const value = data?.value ?? 50;
  const label = data?.classification ?? "Neutral";

  return (
    <QrProWidgetCard title="Fear & Greed" headerClass="bg-violet-950 text-violet-100">
      <QrProSemiGauge
        value={value}
        size="sm"
        label={label}
        zones={[
          { start: 0, end: 25, color: "#f87171" },
          { start: 25, end: 45, color: "#fb923c" },
          { start: 45, end: 55, color: "#94a3b8" },
          { start: 55, end: 75, color: "#a3e635" },
          { start: 75, end: 100, color: "#34d399" },
        ]}
      />
      <p className="mt-1 text-center font-mono text-[8px] text-slate-500">
        Prev: {data?.prev ?? "—"} · 1W: {data?.weekAgo ?? "—"} · 1M: {data?.monthAgo ?? "—"}
      </p>
    </QrProWidgetCard>
  );
}

export function QrProEconomicSchedule() {
  const [calendar, setCalendar] = useState<KuriskoEconomicCalendar | null>(null);
  const today = new Date().toLocaleDateString([], { month: "short", day: "numeric" });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/kurisko/economic-calendar");
        if (res.ok) setCalendar((await res.json()) as KuriskoEconomicCalendar);
      } catch {
        /* non-fatal */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 10 * 60_000);
    return () => window.clearInterval(id);
  }, []);

  const events = (calendar?.events ?? []).filter((e) => e.impact === "high" || e.impact === "medium");

  return (
    <QrProWidgetCard
      title="Economic Schedule"
      subtitle={`High-impact USD events · ${today}`}
      headerClass="bg-blue-900 text-blue-100"
    >
      {events.length === 0 ? (
        <p className="text-[9px] text-slate-500">{calendar?.note ?? "No upcoming events."}</p>
      ) : (
        <ul className="max-h-28 space-y-1 overflow-y-auto">
          {events.map((e, i) => (
            <li key={`${e.time}-${i}`} className="text-[8px]">
              <div className="flex justify-between gap-1">
                <span className="font-mono text-slate-400">{formatEventTime(e.time)}</span>
                <span className={e.impact === "high" ? "text-rose-400" : "text-amber-300"}>{e.country}</span>
              </div>
              <p className="truncate text-slate-300">{e.event}</p>
            </li>
          ))}
        </ul>
      )}
    </QrProWidgetCard>
  );
}
