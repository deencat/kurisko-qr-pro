import { DEFAULT_EQUITY, runBacktestOnSymbols, summarize } from "../backtest";
import type { GusParams } from "../types";
import { PaperBroker } from "./broker";
import { assertParity } from "./parity";
import { insertPaperOrders, insertPaperRun, insertPaperTrades } from "./store";
import type { PaperMode, PaperRunResult } from "./types";

export function runPaperSession(input: {
  params: GusParams;
  symbols: string[];
  mode: PaperMode;
  equity?: number;
  persist?: boolean;
}): PaperRunResult {
  const equity = input.equity ?? DEFAULT_EQUITY;
  const startedAt = Date.now();
  const backtest = runBacktestOnSymbols(input.params, input.symbols, equity);

  const broker = new PaperBroker();
  for (const day of backtest.days) {
    for (const trade of day.trades) {
      broker.ingestTradeLegs(day.symbol, trade.legs);
    }
  }

  // Paper trades are identical to backtest trades by construction for Phase 3
  // (same engine). Parity still runs to catch accidental divergence if engine forks later.
  const trades = backtest.trades.map((t) => ({ ...t, legs: t.legs.map((l) => ({ ...l })) }));
  const parity = assertParity(backtest, trades);

  let runId: number | null = null;
  if (input.persist !== false) {
    const summary = summarize(backtest.days, trades);
    runId = insertPaperRun({
      mode: input.mode,
      paramsJson: JSON.stringify(input.params),
      equity,
      status: parity.ok ? "ok" : "fail",
      summaryJson: JSON.stringify({ summary, parity }),
      startedAt,
      finishedAt: Date.now(),
    });
    insertPaperOrders(runId, broker.orders);
    insertPaperTrades(runId, trades);
  }

  return {
    mode: input.mode,
    params: input.params,
    equity,
    backtest,
    orders: broker.orders,
    trades,
    runId,
    parity,
  };
}
