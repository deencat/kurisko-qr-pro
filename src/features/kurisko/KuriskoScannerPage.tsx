"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QrProFooter } from "@/features/kurisko/qr-pro/QrProFooter";
import { QrProHeader, type QrProViewMode } from "@/features/kurisko/qr-pro/QrProHeader";
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
  KuriskoScanFeed,
  KuriskoSnapshot,
  KuriskoSymbolLevels,
} from "@/lib/kurisko/snapshot/types";

const POLL_MS = 60_000;

function toIsoFromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

export function KuriskoScannerPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<KuriskoScanFeed | null>(null);
  const [alerts, setAlerts] = useState<KuriskoAlert[]>([]);
  const [matrices, setMatrices] = useState<Record<string, KuriskoMatrix | null>>({});
  const [levels, setLevels] = useState<KuriskoSymbolLevels[]>([]);
  const [fearGreed, setFearGreed] = useState<KuriskoFearGreed | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState("US500");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [mode, setMode] = useState<QrProViewMode>("live");
  const [replayAt, setReplayAt] = useState("");
  const [replayScanRunId, setReplayScanRunId] = useState<string | null>(null);
  const liveScanRef = useRef<KuriskoScanFeed | null>(null);

  useKuriskoAudioAlerts(alerts, audioEnabled && mode === "live");

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

  const loadAlerts = useCallback(async (replayFrom?: number, replayTo?: number) => {
    try {
      const url =
        replayFrom != null && replayTo != null
          ? `/api/kurisko/history/alerts?from=${encodeURIComponent(new Date(replayFrom - 3600_000).toISOString())}&to=${encodeURIComponent(new Date(replayTo + 3600_000).toISOString())}&limit=50`
          : "/api/kurisko/alerts?limit=50";
      const res = await fetch(url);
      const data = (await res.json()) as KuriskoAlertsResponse;
      if (res.ok) setAlerts(data.alerts);
    } catch {
      /* non-fatal */
    }
  }, []);

  const applyScanFeed = useCallback(
    (data: KuriskoScanFeed & { error?: string; message?: string }) => {
      setScan(data);
      setMatrices(data.matrices ?? {});

      if (data.message && !data.results?.length) {
        setError(data.message);
      } else if (data.errors?.length && !data.results?.length) {
        setError(data.errors.map((e) => `${e.symbol}: ${e.error}`).join("; "));
      } else {
        setError(null);
      }
    },
    []
  );

  const loadScanFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kurisko/scan");
      const data = (await res.json()) as KuriskoScanFeed & { error?: string; message?: string };

      if (!res.ok && res.status !== 202) {
        throw new Error(data.error ?? "Failed to load scan feed");
      }

      applyScanFeed({ ...data, replayMode: "live" });
      liveScanRef.current = data;
      setReplayScanRunId(null);

      await loadAlerts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scan feed");
    } finally {
      setLoading(false);
    }
  }, [applyScanFeed, loadAlerts]);

  const loadReplayFeed = useCallback(async () => {
    if (!replayAt) return;

    setLoading(true);
    setError(null);
    try {
      const atIso = toIsoFromDatetimeLocal(replayAt);
      const res = await fetch(`/api/kurisko/history/scan?at=${encodeURIComponent(atIso)}`);
      const data = (await res.json()) as KuriskoScanFeed & { error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load replay");
      }

      applyScanFeed(data);
      setReplayScanRunId(data.scanRunId ?? null);
      await loadAlerts(data.scannedAt, data.scannedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load replay");
    } finally {
      setLoading(false);
    }
  }, [applyScanFeed, loadAlerts, replayAt]);

  const loadReplayStep = useCallback(
    async (direction: "prev" | "next") => {
      if (!replayScanRunId) return;

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/kurisko/history/scan/${encodeURIComponent(replayScanRunId)}?adjacent=${direction}`
        );
        const data = (await res.json()) as KuriskoScanFeed & { error?: string };

        if (!res.ok) {
          throw new Error(data.error ?? `No ${direction} scan run`);
        }

        applyScanFeed(data);
        setReplayScanRunId(data.scanRunId ?? null);
        if (data.scannedAt) {
          const d = new Date(data.scannedAt);
          const pad = (n: number) => String(n).padStart(2, "0");
          setReplayAt(
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
          );
        }
        await loadAlerts(data.scannedAt, data.scannedAt);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Replay step failed");
      } finally {
        setLoading(false);
      }
    },
    [applyScanFeed, loadAlerts, replayScanRunId]
  );

  const handleModeChange = useCallback(
    (next: QrProViewMode) => {
      setMode(next);
      if (next === "live") {
        if (liveScanRef.current) {
          applyScanFeed({ ...liveScanRef.current, replayMode: "live" });
        }
        void loadScanFeed();
      } else if (scan?.scannedAt) {
        const d = new Date(scan.scannedAt);
        const pad = (n: number) => String(n).padStart(2, "0");
        setReplayAt(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
        );
      }
    },
    [applyScanFeed, loadScanFeed, scan?.scannedAt]
  );

  useEffect(() => {
    void loadScanFeed();
    void loadLevels();
    void loadFearGreed();
  }, [loadScanFeed, loadLevels, loadFearGreed]);

  useEffect(() => {
    if (mode !== "live") return;
    const id = window.setInterval(() => void loadScanFeed(), POLL_MS);
    return () => window.clearInterval(id);
  }, [loadScanFeed, mode]);

  const snapshots: KuriskoSnapshot[] = [...(scan?.results ?? [])].sort(
    (a, b) => stageRank(a.stage) - stageRank(b.stage) || b.passCount - a.passCount
  );

  return (
    <div className="flex min-h-full flex-col bg-[#060d18]">
      <QrProHeader
        buyCount={scan?.buyCount ?? 0}
        sellCount={scan?.sellCount ?? 0}
        loading={loading || Boolean(scan?.scanning)}
        scannedAt={scan?.scannedAt}
        scanning={scan?.scanning}
        stale={scan?.stale}
        audioEnabled={audioEnabled}
        mode={mode}
        replayAt={replayAt}
        canReplayStep={Boolean(replayScanRunId)}
        onAudioToggle={() => setAudioEnabled((v) => !v)}
        onRefresh={() => void loadScanFeed()}
        onModeChange={handleModeChange}
        onReplayAtChange={setReplayAt}
        onLoadReplay={() => void loadReplayFeed()}
        onReplayStep={(dir) => void loadReplayStep(dir)}
      />

      <div className="grid flex-1 gap-2 p-2 xl:grid-cols-[1fr_260px]">
        <div className="space-y-2">
          {mode === "replay" ? (
            <p className="rounded border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
              Viewing historical snapshot from local cache — switch to Live to resume 60s polling.
            </p>
          ) : null}
          {error ? (
            <p className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          ) : null}
          {mode === "live" && scan?.stale ? (
            <p className="text-[10px] text-amber-400">Scan data is stale — waiting for the next server refresh.</p>
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

          {mode === "live" ? <QrProWidgets /> : null}

          <QrProLiveCharts snapshots={snapshots} levels={levels} />

          <div className="grid gap-2 md:grid-cols-2">
            <QrProStockOfWeek snapshots={snapshots} />
            <QrProTradeNotes snapshots={snapshots} fearGreed={fearGreed} />
          </div>

          <QrProSignalMatrix matrices={matrices} loading={loading || Boolean(scan?.scanning)} />
        </div>

        <QrProSidebar alerts={alerts} snapshots={snapshots} loading={loading || Boolean(scan?.scanning)} />
      </div>

      <QrProFooter />
    </div>
  );
}
