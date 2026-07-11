"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2, Radio, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { playTestAlert } from "./useKuriskoAudioAlerts";

const FLOW = [
  { n: 1, label: "ARM", color: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  { n: 2, label: "STAGE1", color: "bg-yellow-500/20 text-yellow-200 border-yellow-500/40" },
  { n: 3, label: "DIV", color: "bg-violet-500/20 text-violet-300 border-violet-500/40" },
  { n: 4, label: "CONFIRM", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" },
  { n: 5, label: "SIGNAL", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
];

interface Props {
  buyCount: number;
  sellCount: number;
  loading: boolean;
  scannedAt?: number | null;
  scanning?: boolean;
  stale?: boolean;
  audioEnabled: boolean;
  onAudioToggle: () => void;
  onRefresh: () => void;
}

function formatScannedAt(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function QrProHeader({
  buyCount,
  sellCount,
  loading,
  scannedAt,
  scanning = false,
  stale = false,
  audioEnabled,
  onAudioToggle,
  onRefresh,
}: Props) {
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="border-b border-slate-800 bg-[#060d18] px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-black tracking-tight text-white">QR PRO SCANNER</h1>
          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
            <Radio className="h-3 w-3" />
            LIVE
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <span className="text-slate-500">SIGNAL FLOW</span>
          {FLOW.map((s, i) => (
            <span key={s.label} className="inline-flex items-center gap-1">
              {i > 0 ? <span className="text-slate-600">→</span> : null}
              <span className={`rounded border px-1.5 py-0.5 font-mono font-semibold ${s.color}`}>
                {s.n}:{s.label}
              </span>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-emerald-400">{buyCount} BUY</span>
          <span className="text-sm font-bold text-rose-400">{sellCount} SELL</span>
          <span
            className={`font-mono text-[10px] ${stale ? "text-amber-400" : scanning ? "text-cyan-400" : "text-slate-400"}`}
            title={scannedAt ? formatScannedAt(scannedAt) : undefined}
          >
            {scanning
              ? "Server scanning…"
              : scannedAt
                ? `Last scanned ${formatScannedAt(scannedAt)}`
                : "Waiting for server scan"}
          </span>
          <span className="font-mono text-xs text-slate-400">{clock}</span>
          <button
            type="button"
            onClick={() => {
              onAudioToggle();
              if (!audioEnabled) playTestAlert();
            }}
            className={`rounded p-1 ${audioEnabled ? "text-cyan-400" : "text-slate-600"}`}
            title={audioEnabled ? "Mute alerts" : "Enable audio alerts"}
            aria-pressed={audioEnabled}
          >
            {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <Bell className="h-4 w-4 text-slate-500" aria-hidden />
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700"
          >
            {loading ? <Loader2 className="inline h-3 w-3 animate-spin" /> : <RefreshCw className="inline h-3 w-3" />}
            <span className="ml-1">Scan</span>
          </button>
        </div>
      </div>
      <p className="mt-1 text-[9px] text-slate-600">
        Capital.com demo · Kurisko K1 quad rotation · server scan every 60s · clients read cached feed
      </p>
    </header>
  );
}
