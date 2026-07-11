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
  KuriskoScanFeed,
  KuriskoSnapshot,
  KuriskoSymbolLevels,
} from "@/lib/kurisko/snapshot/types";

const POLL_MS = 60_000;

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

  const loadScanFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kurisko/scan");
      const data = (await res.json()) as KuriskoScanFeed & { error?: string; message?: string };

      if (!res.ok && res.status !== 202) {
        throw new Error(data.error ?? "Failed to load scan feed");
      }

      setScan(data);
      setMatrices(data.matrices ?? {});

      if (data.message && !data.results?.length) {
        setError(data.message);
      } else if (data.errors?.length && !data.results?.length) {
        throw new Error(data.errors.map((e) => `${e.symbol}: ${e.error}`).join("; "));
      } else {
        setError(null);
      }

      await loadAlerts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scan feed");
    } finally {
      setLoading(false);
    }
  }, [loadAlerts]);

  useEffect(() => {
    void loadScanFeed();
    void loadLevels();
    void loadFearGreed();
  }, [loadScanFeed, loadLevels, loadFearGreed]);

  useEffect(() => {
    const id = window.setInterval(() => void loadScanFeed(), POLL_MS);
    return () => window.clearInterval(id);
  }, [loadScanFeed]);

  const snapshots: KuriskoSnapshot[] = [...(scan?.results ?? [])].sort(
    (a, b) => stageRank(a.stage) - stageRank(b.stage) || b.passCount - a.passCount
  );

  return (
    <div className="flex min-h-full flex-col bg-[#060d18]">
      <QrProHeader
        buyCount={scan?.buyCount ?? 0}
        sellCount={scan?.sellCount ?? 0}
        loading={loading || Boolean(scan?.scanning)}
        audioEnabled={audioEnabled}
        onAudioToggle={() => setAudioEnabled((v) => !v)}
        onRefresh={() => void loadScanFeed()}
      />

      <div className="grid flex-1 gap-2 p-2 xl:grid-cols-[1fr_260px]">
        <div className="space-y-2">
          {error ? (
            <p className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          ) : null}
          {scan?.stale ? (
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

          <QrProWidgets />

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
