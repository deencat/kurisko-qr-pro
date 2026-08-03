"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

type DuxStatus = {
  at: number;
  store: { candleSeries: number; symbols: string[] };
  liveConfig: {
    armed: boolean;
    trdEnv: string;
    broker: string;
    maxShares: number;
    maxNotional: number;
    allowlist: string[];
    kill: boolean;
  };
  paper: {
    runs: {
      id: number;
      started_at: number;
      mode: string;
      equity: number;
      status: string;
      summary_json: string | null;
    }[];
    trades: {
      id: number;
      run_id: number;
      symbol: string;
      entry_ts: number;
      exit_ts: number;
      shares: number;
      avg_entry: number;
      avg_exit: number;
      pnl: number;
      exit_reason: string;
    }[];
    orders: {
      id: number;
      run_id: number;
      symbol: string;
      t: number;
      side: string;
      shares: number;
      price: number;
      reason: string;
    }[];
  };
  live: {
    runs: {
      id: number;
      started_at: number;
      broker: string;
      trd_env: string;
      armed: number;
      status: string;
      summary_json: string | null;
    }[];
    orders: {
      id: number;
      run_id: number;
      symbol: string;
      t: number;
      side: string;
      intent_shares: number;
      clamped_shares: number;
      price: number;
      reason: string;
      status: string;
      max_sell_short: number | null;
      broker_order_id: string | null;
      broker_msg: string | null;
    }[];
  };
};

function fmtTs(ms: number) {
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function money(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

function statusTone(status: string) {
  if (status === "ok" || status === "dry_run") return "text-emerald-300";
  if (status === "submitted") return "text-cyan-300";
  if (status === "rejected" || status === "killed" || status === "fail" || status === "error")
    return "text-rose-300";
  return "text-slate-300";
}

export function DuxResearchPage() {
  const [data, setData] = useState<DuxStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dux/status");
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
      setData(json as DuxStatus);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="min-h-screen bg-[#060d18] text-slate-100">
      <header className="border-b border-slate-800/80 px-4 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/90">Dux GUS</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">Research desk</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              Paper shadow fills and live dry-run tickets from the CLI research loop. Not the Capital.com
              QR scanner.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/day-trade/qr-scanner"
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"
            >
              QR Scanner
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-500/40"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 p-4">
        {error && (
          <p className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}

        {!data && loading && (
          <p className="text-sm text-slate-400">Loading Dux status…</p>
        )}

        {data && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Candle series"
                value={String(data.store.candleSeries)}
                hint={data.store.symbols.slice(0, 4).join(", ") || "empty store"}
              />
              <Stat
                label="Live armed"
                value={data.liveConfig.armed ? "YES" : "NO"}
                hint={`${data.liveConfig.trdEnv} · ${data.liveConfig.broker}${data.liveConfig.kill ? " · KILL" : ""}`}
                danger={data.liveConfig.armed || data.liveConfig.kill}
              />
              <Stat
                label="Paper runs"
                value={String(data.paper.runs.length)}
                hint="latest in DB"
              />
              <Stat
                label="Live tickets"
                value={String(data.live.orders.length)}
                hint={
                  data.liveConfig.allowlist.length
                    ? `allow: ${data.liveConfig.allowlist.join(", ")}`
                    : "allowlist empty"
                }
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Panel title="Paper runs">
                {data.paper.runs.length === 0 ? (
                  <Empty hint="Run: npm run dux:paper-smoke" />
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="py-1 font-medium">ID</th>
                        <th className="font-medium">Mode</th>
                        <th className="font-medium">Status</th>
                        <th className="font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.paper.runs.map((r) => (
                        <tr key={r.id} className="border-t border-slate-800/80">
                          <td className="py-1.5 text-slate-300">{r.id}</td>
                          <td>{r.mode}</td>
                          <td className={statusTone(r.status)}>{r.status}</td>
                          <td className="text-slate-400">{fmtTs(r.started_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>

              <Panel title="Live runs">
                {data.live.runs.length === 0 ? (
                  <Empty hint="Run: npm run dux:live-smoke" />
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="py-1 font-medium">ID</th>
                        <th className="font-medium">Broker</th>
                        <th className="font-medium">Armed</th>
                        <th className="font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.live.runs.map((r) => (
                        <tr key={r.id} className="border-t border-slate-800/80">
                          <td className="py-1.5 text-slate-300">{r.id}</td>
                          <td>
                            {r.broker}/{r.trd_env}
                          </td>
                          <td className={r.armed ? "text-amber-300" : "text-slate-400"}>
                            {r.armed ? "yes" : "no"}
                          </td>
                          <td className={statusTone(r.status)}>{r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
            </section>

            <Panel title="Paper trades">
              {data.paper.trades.length === 0 ? (
                <Empty hint="No paper trades yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="py-1 font-medium">Symbol</th>
                        <th className="font-medium">Shares</th>
                        <th className="font-medium">Entry</th>
                        <th className="font-medium">Exit</th>
                        <th className="font-medium">PnL</th>
                        <th className="font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.paper.trades.map((t) => (
                        <tr key={t.id} className="border-t border-slate-800/80">
                          <td className="py-1.5 font-medium text-slate-200">{t.symbol}</td>
                          <td>{t.shares}</td>
                          <td>{t.avg_entry.toFixed(3)}</td>
                          <td>{t.avg_exit.toFixed(3)}</td>
                          <td className={t.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}>
                            {money(t.pnl)}
                          </td>
                          <td className="text-slate-400">{t.exit_reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Live / dry-run tickets">
              {data.live.orders.length === 0 ? (
                <Empty hint="No live tickets yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="py-1 font-medium">Symbol</th>
                        <th className="font-medium">Side</th>
                        <th className="font-medium">Intent→Clamp</th>
                        <th className="font-medium">Status</th>
                        <th className="font-medium">max_ss</th>
                        <th className="font-medium">Msg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.live.orders.map((o) => (
                        <tr key={o.id} className="border-t border-slate-800/80">
                          <td className="py-1.5 font-medium text-slate-200">{o.symbol}</td>
                          <td>{o.side}</td>
                          <td>
                            {o.intent_shares}→{o.clamped_shares}
                          </td>
                          <td className={statusTone(o.status)}>{o.status}</td>
                          <td className="text-slate-400">{o.max_sell_short ?? "—"}</td>
                          <td className="max-w-[220px] truncate text-slate-400" title={o.broker_msg ?? ""}>
                            {o.broker_msg || o.broker_order_id || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Recent paper shadow orders">
              {data.paper.orders.length === 0 ? (
                <Empty hint="No paper orders" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="py-1 font-medium">When</th>
                        <th className="font-medium">Symbol</th>
                        <th className="font-medium">Side</th>
                        <th className="font-medium">Shares</th>
                        <th className="font-medium">Price</th>
                        <th className="font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.paper.orders.slice(0, 20).map((o) => (
                        <tr key={o.id} className="border-t border-slate-800/80">
                          <td className="py-1.5 text-slate-400">{fmtTs(o.t)}</td>
                          <td>{o.symbol}</td>
                          <td>{o.side}</td>
                          <td>{o.shares}</td>
                          <td>{o.price.toFixed(3)}</td>
                          <td className="text-slate-400">{o.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <p className="pb-6 text-[11px] text-slate-500">
              Updated {fmtTs(data.at)}. CLI:{" "}
              <code className="text-slate-400">dux:paper-smoke</code> ·{" "}
              <code className="text-slate-400">dux:live-smoke</code>. Live place requires{" "}
              <code className="text-slate-400">DUX_LIVE_ARMED=1</code>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/50 px-3 py-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${danger ? "text-amber-300" : "text-slate-100"}`}>
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-slate-800 bg-slate-950/40 px-3 py-3">
      <h2 className="mb-2 text-sm font-medium text-slate-200">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ hint }: { hint: string }) {
  return <p className="text-xs text-slate-500">{hint}</p>;
}
