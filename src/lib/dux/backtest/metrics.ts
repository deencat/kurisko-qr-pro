import type { BacktestSummary, DayResult, Trade } from "./types";

export function summarize(days: DayResult[], trades: Trade[]): BacktestSummary {
  const skips: Record<string, number> = {};
  for (const d of days) {
    if (d.skipReason && d.trades.length === 0) {
      skips[d.skipReason] = (skips[d.skipReason] ?? 0) + 1;
    }
  }
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl <= 0).length;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const rVals = trades.map((t) => t.rMultiple).filter((r): r is number => r != null);
  const avgR = rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : null;

  // Equity curve max DD from trade sequence
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of trades) {
    equity += t.pnl;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }

  return {
    days: days.length,
    tradedDays: days.filter((d) => d.trades.length > 0).length,
    skips,
    trades: trades.length,
    wins,
    losses,
    winRate: trades.length ? wins / trades.length : 0,
    totalPnl,
    expectancy: trades.length ? totalPnl / trades.length : 0,
    avgR,
    maxDrawdown: maxDd,
  };
}
