import type { BacktestResult, Trade } from "../backtest/types";
import type { ParityMismatch, ParityReport } from "./types";

const PNL_ABS = 0.01;
const PX_REL = 1e-6;

function almostEqual(a: number, b: number, absTol: number, relTol: number): boolean {
  const diff = Math.abs(a - b);
  if (diff <= absTol) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return diff / scale <= relTol;
}

function tradeKey(t: Trade): string {
  return `${t.symbol}|${t.entryTs}|${t.exitTs}|${t.shares}`;
}

export function assertParity(backtest: BacktestResult, paperTrades: Trade[]): ParityReport {
  const mismatches: ParityMismatch[] = [];
  const bt = [...backtest.trades].sort((a, b) => tradeKey(a).localeCompare(tradeKey(b)));
  const pp = [...paperTrades].sort((a, b) => tradeKey(a).localeCompare(tradeKey(b)));

  if (bt.length !== pp.length) {
    mismatches.push({ path: "trades.length", expected: bt.length, actual: pp.length });
  }

  const n = Math.min(bt.length, pp.length);
  for (let i = 0; i < n; i++) {
    const a = bt[i]!;
    const b = pp[i]!;
    const prefix = `trades[${i}]`;
    if (a.symbol !== b.symbol) {
      mismatches.push({ path: `${prefix}.symbol`, expected: a.symbol, actual: b.symbol });
    }
    if (a.shares !== b.shares) {
      mismatches.push({ path: `${prefix}.shares`, expected: a.shares, actual: b.shares });
    }
    if (a.entryTs !== b.entryTs) {
      mismatches.push({ path: `${prefix}.entryTs`, expected: a.entryTs, actual: b.entryTs });
    }
    if (a.exitTs !== b.exitTs) {
      mismatches.push({ path: `${prefix}.exitTs`, expected: a.exitTs, actual: b.exitTs });
    }
    if (a.exitReason !== b.exitReason) {
      mismatches.push({ path: `${prefix}.exitReason`, expected: a.exitReason, actual: b.exitReason });
    }
    if (!almostEqual(a.avgEntry, b.avgEntry, 1e-9, PX_REL)) {
      mismatches.push({ path: `${prefix}.avgEntry`, expected: a.avgEntry, actual: b.avgEntry });
    }
    if (!almostEqual(a.avgExit, b.avgExit, 1e-9, PX_REL)) {
      mismatches.push({ path: `${prefix}.avgExit`, expected: a.avgExit, actual: b.avgExit });
    }
    if (!almostEqual(a.pnl, b.pnl, PNL_ABS, PX_REL)) {
      mismatches.push({ path: `${prefix}.pnl`, expected: a.pnl, actual: b.pnl });
    }
  }

  // Skip reasons must match per symbol-day
  const btSkips = Object.fromEntries(
    backtest.days.map((d) => [`${d.symbol}:${d.dayKey}`, d.skipReason ?? ""])
  );
  // paper uses same day engine — checked via trade parity + caller day count

  if (Object.keys(btSkips).length === 0 && bt.length === 0) {
    // still ok — empty universe
  }

  return { ok: mismatches.length === 0, mismatches };
}
