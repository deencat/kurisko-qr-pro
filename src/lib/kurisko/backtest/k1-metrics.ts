import type { K1BacktestSummary, K1Trade } from "./k1-types";

export function summarizeK1Trades(
  symbol: string,
  bars: number,
  trades: K1Trade[],
  signals: number
): K1BacktestSummary {
  const wins = trades.filter((t) => t.netPnl > 0).length;
  const losses = trades.filter((t) => t.netPnl <= 0).length;
  const grossWins = trades.filter((t) => t.grossPnl > 0).reduce((s, t) => s + t.grossPnl, 0);
  const grossLossAbs = Math.abs(
    trades.filter((t) => t.grossPnl < 0).reduce((s, t) => s + t.grossPnl, 0)
  );
  const grossPnl = trades.reduce((s, t) => s + t.grossPnl, 0);
  const costs = trades.reduce((s, t) => s + t.costs, 0);
  const netPnl = trades.reduce((s, t) => s + t.netPnl, 0);

  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const t of trades) {
    equity += t.netPnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }

  const byExitReason: Record<string, number> = {};
  for (const t of trades) {
    byExitReason[t.exitReason] = (byExitReason[t.exitReason] ?? 0) + 1;
  }

  return {
    symbol,
    bars,
    signals,
    trades: trades.length,
    wins,
    losses,
    winRate: trades.length ? wins / trades.length : 0,
    profitFactor:
      grossLossAbs > 0 ? grossWins / grossLossAbs : grossWins > 0 ? Number.POSITIVE_INFINITY : null,
    grossPnl,
    costs,
    netPnl,
    expectancy: trades.length ? netPnl / trades.length : 0,
    maxDrawdown,
    byExitReason,
  };
}
