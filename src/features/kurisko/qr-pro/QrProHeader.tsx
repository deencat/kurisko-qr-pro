"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, ChevronLeft, ChevronRight, History, Loader2, Radio, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { playTestAlert } from "./useKuriskoAudioAlerts";

const FLOW = [
  { n: 1, label: "ARM", color: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  { n: 2, label: "STAGE1", color: "bg-yellow-500/20 text-yellow-200 border-yellow-500/40" },
  { n: 3, label: "DIV", color: "bg-violet-500/20 text-violet-300 border-violet-500/40" },
  { n: 4, label: "CONFIRM", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" },
  { n: 5, label: "SIGNAL", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
];

export type QrProViewMode = "live" | "replay";

interface Props {
  buyCount: number;
  sellCount: number;
  loading: boolean;
  scannedAt?: number | null;
  scanning?: boolean;
  stale?: boolean;
  audioEnabled: boolean;
  mode: QrProViewMode;
  replayAt: string;
  canReplayStep?: boolean;
  onAudioToggle: () => void;
  onRefresh: () => void;
  onModeChange: (mode: QrProViewMode) => void;
  onReplayAtChange: (value: string) => void;
  onLoadReplay: () => void;
  onReplayStep: (direction: "prev" | "next") => void;
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

function toDatetimeLocalValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function QrProHeader({
  buyCount,
  sellCount,
  loading,
  scannedAt,
  scanning = false,
  stale = false,
  audioEnabled,
  mode,
  replayAt,
  canReplayStep = false,
  onAudioToggle,
  onRefresh,
  onModeChange,
  onReplayAtChange,
  onLoadReplay,
  onReplayStep,
}: Props) {
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (mode === "replay" && scannedAt && !replayAt) {
      onReplayAtChange(toDatetimeLocalValue(scannedAt));
    }
  }, [mode, scannedAt, replayAt, onReplayAtChange]);

  return (
    <header className="border-b border-slate-800 bg-[#060d18] px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-black tracking-tight text-white">QR PRO SCANNER</h1>
          <Link
            href="/day-trade/dux"
            className="rounded border border-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-400 hover:border-cyan-500/40 hover:text-cyan-200"
          >
            Dux
          </Link>
          {mode === "live" ? (
            <span className="inline-flex items-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              <Radio className="h-3 w-3" />
              LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-violet-500/50 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-300">
              <History className="h-3 w-3" />
              REPLAY
            </span>
          )}
          <div className="flex rounded border border-slate-700 text-[10px]">
            <button
              type="button"
              onClick={() => onModeChange("live")}
              className={`px-2 py-0.5 font-bold ${mode === "live" ? "bg-cyan-700 text-white" : "text-slate-400"}`}
            >
              Live
            </button>
            <button
              type="button"
              onClick={() => onModeChange("replay")}
              className={`px-2 py-0.5 font-bold ${mode === "replay" ? "bg-violet-700 text-white" : "text-slate-400"}`}
            >
              Replay
            </button>
          </div>
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

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-emerald-400">{buyCount} BUY</span>
          <span className="text-sm font-bold text-rose-400">{sellCount} SELL</span>
          <span
            className={`font-mono text-[10px] ${stale ? "text-amber-400" : scanning ? "text-cyan-400" : mode === "replay" ? "text-violet-300" : "text-slate-400"}`}
            title={scannedAt ? formatScannedAt(scannedAt) : undefined}
          >
            {mode === "replay"
              ? scannedAt
                ? `Replay ${formatScannedAt(scannedAt)}`
                : "Pick a time"
              : scanning
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
          {mode === "live" ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700"
            >
              {loading ? <Loader2 className="inline h-3 w-3 animate-spin" /> : <RefreshCw className="inline h-3 w-3" />}
              <span className="ml-1">Scan</span>
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                type="datetime-local"
                value={replayAt}
                onChange={(e) => onReplayAtChange(e.target.value)}
                className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
              />
              <button
                type="button"
                onClick={onLoadReplay}
                disabled={loading || !replayAt}
                className="rounded border border-violet-600 bg-violet-900/40 px-2 py-1 text-[10px] text-violet-200 hover:bg-violet-800/40"
              >
                Load
              </button>
              {canReplayStep ? (
                <>
                  <button
                    type="button"
                    onClick={() => onReplayStep("prev")}
                    className="rounded border border-slate-600 p-1 text-slate-300 hover:bg-slate-800"
                    title="Previous scan"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onReplayStep("next")}
                    className="rounded border border-slate-600 p-1 text-slate-300 hover:bg-slate-800"
                    title="Next scan"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <p className="mt-1 text-[9px] text-slate-600">
        {mode === "live"
          ? "Capital.com demo · Kurisko K1 quad rotation · server scan every 60s · clients read cached feed"
          : "Replay mode · reading persisted snapshots from SQLite · no live Capital calls"}
      </p>
    </header>
  );
}
