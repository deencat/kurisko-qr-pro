"use client";

import { useCallback, useEffect, useState } from "react";
import { QrProFooter } from "@/features/kurisko/qr-pro/QrProFooter";
import { QrProHeader } from "@/features/kurisko/qr-pro/QrProHeader";
import { QrProInstrumentCard } from "@/features/kurisko/qr-pro/QrProInstrumentCard";
import { QrProLiveCharts } from "@/features/kurisko/qr-pro/QrProLiveCharts";
import { QrProSidebar } from "@/features/kurisko/qr-pro/QrProSidebar";
import { QrProSignalMatrix } from "@/features/kurisko/qr-pro/QrProSignalMatrix";
import { QrProStockOfWeek } from "@/features/kurisko/qr-pro/QrProStockOfWeek";
import { QrProTradeNotes } from "@/features/kurisko/qr-pro/QrProTradeNotes";
import { QrProWidgets } from "@/features/kurisko/qr-pro/QrProWidgets";
import { QR_SYMBOLS } from "@/features/kurisko/qr-pro/theme";
import { useKuriskoAudioAlerts } from "@/features/kurisko/qr-pro/useKuriskoAudioAlerts";
import { stageRank } from "@/lib/kurisko/snapshot/k1-stage";
import type {
  KuriskoAlert,
  KuriskoAlertsResponse,
  KuriskoFearGreed,
  KuriskoLevelsResponse,
  KuriskoMatrix,
  KuriskoScanResult,
  KuriskoSnapshot,
  KuriskoSymbolLevels,
} from "@/lib/kurisko/snapshot/types";

const DEFAULT_SYMBOLS = QR_SYMBOLS.join(",");
const POLL_MS = 60_000;

export function KuriskoScannerPage() {
  const [loading, setLoading] = useState(false);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<KuriskoScanResult | null>(null);
  const [alerts, setAlerts] = useState<KuriskoAlert[]>([]);
  const [matrices, setMatrices] = useState<Record<string, KuriskoMatrix | null>>({});
  const [levels, setLevels] = useState<KuriskoSymbolLevels[]>([]);
  const [fearGreed, setFearGreed] = useState<KuriskoFearGreed | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState("US500");
  const [audioEnabled, setAudioEnabled] = useState(true);

  useKuriskoAudioAlerts(alerts, audioEnabled);

  const loadLevels = useCallback(async () => {
    try {
      const res = await fetch("/api/kurisko/levels");
      if (res.ok) {
        const data = (await res.json()) as KuriskoLevelsResponse;
        setLevels(data.symbols);
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadFearGreed = useCallback(async () => {
    try {
      const res = await fetch("/api/kurisko/fear-greed");
      if (res.ok) setFearGreed((await res.json()) as KuriskoFearGreed);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/kurisko/alerts?limit=50");
      const data = (await res.json()) as KuriskoAlertsResponse;
      if (res.ok) setAlerts(data.alerts);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadAllMatrices = useCallback(async (symbols: string[]) => {
    setMatrixLoading(true);
    const next: Record<string, KuriskoMatrix | null> = {};
    for (const sym of symbols) {
      try {
        const res = await fetch(`/api/kurisko/matrix?symbol=${encodeURIComponent(sym)}`);
        const data = await res.json();
        next[sym] = res.ok ? (data as KuriskoMatrix) : null;
      } catch {
        next[sym] = null;
      }
    }
    setMatrices(next);
    setMatrixLoading(false);
  }, []);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kurisko/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: DEFAULT_SYMBOLS, timeframePairId: "1m+5m" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setScan(data as KuriskoScanResult);
      const syms = (data.results as KuriskoSnapshot[]).map((r) => r.symbol);
      if (syms.length) void loadAllMatrices(syms);
      if (data.errors?.length && !data.results?.length) {
        throw new Error(
          data.errors.map((e: { symbol: string; error: string }) => `${e.symbol}: ${e.error}`).join("; ")
        );
      }
      await loadAlerts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, [loadAlerts, loadAllMatrices]);

  useEffect(() => {
    void runScan();
    void loadLevels();
    void loadFearGreed();
  }, [runScan, loadLevels, loadFearGreed]);

  useEffect(() => {
    const id = window.setInterval(() => void runScan(), POLL_MS);
    return () => window.clearInterval(id);
  }, [runScan]);

  const snapshots: KuriskoSnapshot[] = [...(scan?.results ?? [])].sort(
    (a, b) => stageRank(a.stage) - stageRank(b.stage) || b.passCount - a.passCount
  );

  return (
    <div className="flex min-h-full flex-col bg-[#060d18]">
      <QrProHeader
        buyCount={scan?.buyCount ?? 0}
        sellCount={scan?.sellCount ?? 0}
        loading={loading}
        audioEnabled={audioEnabled}
        onAudioToggle={() => setAudioEnabled((v) => !v)}
        onRefresh={() => void runScan()}
      />

      <div className="grid flex-1 gap-2 p-2 xl:grid-cols-[1fr_260px]">
        <div className="space-y-2">
          {error ? (
            <p className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          ) : null}
          {scan?.errors?.length ? (
            <p className="text-[10px] text-amber-400">
              Partial: {scan.errors.map((e) => `${e.symbol}: ${e.error}`).join(" · ")}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3 xl:grid-cols-5">
            {snapshots.map((s) => (
              <QrProInstrumentCard
                key={s.symbol}
                snapshot={s}
                matrix={matrices[s.symbol] ?? null}
                selected={selectedSymbol === s.symbol}
                onSelect={setSelectedSymbol}
              />
            ))}
            {loading && snapshots.length === 0
              ? QR_SYMBOLS.map((sym) => (
                  <div key={sym} className="h-44 animate-pulse rounded border border-slate-800 bg-slate-900/50" />
                ))
              : null}
          </div>

          <QrProWidgets />

          <QrProLiveCharts snapshots={snapshots} levels={levels} />

          <div className="grid gap-2 md:grid-cols-2">
            <QrProStockOfWeek snapshots={snapshots} />
            <QrProTradeNotes snapshots={snapshots} fearGreed={fearGreed} />
          </div>

          <QrProSignalMatrix matrices={matrices} loading={matrixLoading} />
        </div>

        <QrProSidebar alerts={alerts} snapshots={snapshots} loading={loading} />
      </div>

      <QrProFooter />
    </div>
  );
}
