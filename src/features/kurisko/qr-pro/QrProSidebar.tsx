"use client";

import type { KuriskoAlert, KuriskoSnapshot } from "@/lib/kurisko/snapshot/types";
import { QrProDepthBars } from "./QrProDepthBars";
import { QrProSemiGauge } from "./QrProSemiGauge";
import { QR_SYMBOL_META, formatQrPrice, vortexLeanLabel } from "./theme";

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function alertLabel(a: KuriskoAlert): { icon: string; text: string; className: string } {
  if (a.toStage === "DIV") {
    return {
      icon: "◙",
      text: a.side === "short" ? "REVERSAL BEAR" : "REVERSAL BULL",
      className: "text-violet-400",
    };
  }
  if (a.action === "BUY") {
    return { icon: "▲", text: "BUY", className: "text-emerald-400" };
  }
  return { icon: "▼", text: "SELL", className: "text-rose-400" };
}

interface Props {
  alerts: KuriskoAlert[];
  snapshots: KuriskoSnapshot[];
  loading?: boolean;
}

/** QR Pro right rail — VORTEXFLOW™, HYPERSCALER™, live alerts. */
export function QrProSidebar({ alerts, snapshots, loading }: Props) {
  const top = snapshots.find((s) => s.stage === "SIGNAL" || s.stage === "CONFIRM") ?? snapshots[0];
  const flux = top?.vortexFlux;
  const ctx = top?.marketContext;
  const meta = top ? QR_SYMBOL_META[top.symbol] : null;

  const vortexScore = flux?.score ?? 50;
  const lean = top ? vortexLeanLabel(flux?.label ?? "NEUTRAL", top.side) : "SCANNING";

  const hyperscalerValue = top
    ? top.side === "long"
      ? Math.max(0, 100 - (ctx?.stoch6010 ?? 50))
      : ctx?.stoch6010 ?? 50
    : 50;

  const setupReady = top && (top.stage === "SIGNAL" || top.stage === "CONFIRM");
  const setupLabel = top
    ? top.side === "long"
      ? "LONG SETUP"
      : "SHORT SETUP"
    : "SCANNING";

  return (
    <aside className="flex flex-col gap-2">
      <div className="rounded border border-slate-700/80 bg-[#0d1b2a] p-2">
        <p className="text-center text-[8px] font-black uppercase tracking-widest text-indigo-300">
          VORTEXFLOW™
        </p>
        <div className="flex items-center gap-2">
          <QrProSemiGauge value={vortexScore} size="sm" label={lean} />
          <div className="flex-1 space-y-1 text-[8px]">
            <StatusLight label="VWAP" on={ctx?.aboveVwap} />
            <StatusLight label="50 SMA" on={ctx?.aboveEma50} />
            <StatusLight label="200 SMA" on={ctx?.aboveEma200} />
          </div>
        </div>
        {top ? (
          <div className="mt-1 border-t border-slate-800 pt-1">
            <QrProDepthBars depths={top.depthStruct} side={top.side} />
          </div>
        ) : null}
      </div>

      <div className="rounded border border-slate-700/80 bg-[#0d1b2a] p-2 text-center">
        <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">HYPERSCALER™</p>
        <QrProSemiGauge
          value={hyperscalerValue}
          size="md"
          zones={[
            { start: 0, end: 40, color: "#f87171" },
            { start: 40, end: 60, color: "#fbbf24" },
            { start: 60, end: 100, color: "#34d399" },
          ]}
        />
        {setupReady ? (
          <div
            className={`mx-auto mt-1 max-w-[140px] rounded border px-2 py-1 text-[9px] font-black ${
              top!.side === "long"
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                : "border-rose-500/50 bg-rose-500/15 text-rose-300"
            }`}
          >
            {setupLabel} [✓]
          </div>
        ) : (
          <p className="mt-1 text-[9px] text-slate-500">{setupLabel}</p>
        )}
        {top ? (
          <>
            <p className="font-mono text-base font-black text-white">{meta?.qrAlias ?? top.symbol}</p>
            <p className="text-[8px] text-slate-500">
              60-10 EMBED · {ctx?.stoch6010Depth ?? 0} · 60-10 = {ctx?.stoch6010?.toFixed(0) ?? "—"}
            </p>
          </>
        ) : null}
      </div>

      {setupReady && top ? (
        <div className="rounded border border-emerald-900/40 bg-emerald-950/20 p-2">
          <p className="text-[8px] font-black uppercase text-emerald-500/80">Trade Tracker</p>
          <p className="font-mono text-sm font-bold text-white">{formatQrPrice(top.price)}</p>
          <p className="text-[9px] font-bold uppercase text-emerald-400">{top.side === "long" ? "LONG" : "SHORT"}</p>
        </div>
      ) : null}

      <div className="flex min-h-[240px] flex-1 flex-col overflow-hidden rounded border border-slate-700/80 bg-[#0a1628]">
        <div className="border-b border-rose-900/50 bg-rose-950/30 px-2 py-1.5">
          <h3 className="text-[9px] font-black uppercase tracking-wider text-rose-300">Live Alerts</h3>
          <p className="text-[7px] text-slate-500">Real-time Kurisko K1 signals</p>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {loading && alerts.length === 0 ? (
            <p className="text-[10px] text-slate-500">Listening…</p>
          ) : alerts.length === 0 ? (
            <p className="text-[10px] text-slate-500">Stage transitions appear here.</p>
          ) : (
            <ul className="space-y-1.5">
              {alerts.map((a) => {
                const lbl = alertLabel(a);
                const alias = QR_SYMBOL_META[a.symbol]?.qrAlias ?? a.symbol;
                return (
                  <li
                    key={a.id}
                    className="rounded border border-slate-800 bg-[#0d1b2a] px-2 py-1.5"
                  >
                    <div className="flex justify-between gap-1">
                      <span className="text-[10px] font-black text-white">
                        {alias} · {a.timeframe}
                      </span>
                      <span className="text-[8px] text-slate-500">
                        {a.source === "tradingview" ? "TV" : "K1"} · {timeAgo(a.ts)}
                      </span>
                    </div>
                    <p className={`text-[10px] font-black ${lbl.className}`}>
                      {lbl.icon} {lbl.text}
                    </p>
                    <p className="font-mono text-[9px] text-slate-400">
                      @ {formatQrPrice(a.price)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

function StatusLight({ label, on }: { label: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-slate-500">{label}</span>
      <span className={on ? "font-bold text-emerald-400" : "text-rose-400"}>
        {on ? "ABOVE" : "BELOW"}
      </span>
    </div>
  );
}
