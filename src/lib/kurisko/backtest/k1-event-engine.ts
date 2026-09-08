/**
 * K1 event backtest — walk 1m bars; enter on diagnoseK1 allPass;
 * exit via configurable modes (mvp / fast93 / tp2_rail / fast93_tp2).
 * Research only — no live orders.
 */
import type { LighterCandle } from "@/lib/lighter/client";
import { riskQty } from "@/lib/aziz/backtest/engine-common";
import {
  KURISKO_DEFAULT_STOP_BUFFER_PCT,
  KURISKO_WARMUP_BARS_1M,
} from "../constants";
import type { K1DiagnoseOpts } from "./k1-diagnose";
import { evaluateK1AtBar } from "./k1-diagnose";
import { buildDualTfContext, channelAtTime } from "./dual-tf-context";
import {
  applyRoundTripCost,
  buildK1EntryLevels,
  checkK1ExitOnBar,
} from "./k1-entry-exit";
import { summarizeK1Trades } from "./k1-metrics";
import type { K1BacktestResult, K1ExitMode, K1OpenPosition, K1Side, K1Trade } from "./k1-types";

export interface K1EventBacktestOpts extends K1DiagnoseOpts {
  symbol?: string;
  /** Structure TF period in ms (default 5m). */
  structurePeriodMs?: number;
  warmupBars?: number;
  timeStopBars?: number;
  /** Fraction of mid price charged each side (spread+slip placeholder). Default 0.5 bps. */
  costBpsPerSide?: number;
  /** Prefer long when both sides allPass on same bar. Default true. */
  preferLongOnTie?: boolean;
  /** Flat any open position on the last bar. Default true. */
  flattenEod?: boolean;
  /** Exit mode (default mvp — prior ~1y baseline). */
  exitMode?: K1ExitMode;
  /** Soft mid (50) exit into 9,3 for fast93 modes. Default false. */
  stochMidExit?: boolean;
}

const STRUCTURE_5M_MS = 5 * 60_000;

export function runK1EventBacktest(
  candlesExec: LighterCandle[],
  opts: K1EventBacktestOpts = {}
): K1BacktestResult {
  const symbol = opts.symbol ?? "UNKNOWN";
  const structurePeriodMs = opts.structurePeriodMs ?? STRUCTURE_5M_MS;
  const warmup = opts.warmupBars ?? KURISKO_WARMUP_BARS_1M;
  const equity = opts.equity ?? 10_000;
  const riskPct = opts.riskPct ?? 2;
  const maxLeverage = opts.maxLeverage ?? 5;
  const stopBufferPct = KURISKO_DEFAULT_STOP_BUFFER_PCT;
  const preferLong = opts.preferLongOnTie ?? true;
  const flattenEod = opts.flattenEod ?? true;

  const ctx = buildDualTfContext(candlesExec, structurePeriodMs);
  const trades: K1Trade[] = [];
  let open: K1OpenPosition | null = null;
  let signals = 0;
  let nextId = 1;

  const closePosition = (
    barIndex: number,
    exitPrice: number,
    exitReason: K1Trade["exitReason"]
  ) => {
    if (!open) return;
    const bar = candlesExec[barIndex]!;
    const { grossPnl, costs, netPnl } = applyRoundTripCost({
      side: open.side,
      qty: open.qty,
      entryPrice: open.entryPrice,
      exitPrice,
      costBpsPerSide: opts.costBpsPerSide,
    });
    trades.push({
      id: nextId++,
      side: open.side,
      entryBar: open.entryBar,
      exitBar: barIndex,
      entryTs: open.entryTs,
      exitTs: bar.t,
      entryPrice: open.entryPrice,
      exitPrice,
      stopPrice: open.stopPrice,
      targetPrice: open.targetPrice,
      qty: open.qty,
      grossPnl,
      costs,
      netPnl,
      exitReason,
      barsHeld: barIndex - open.entryBar,
    });
    open = null;
  };

  for (let i = warmup; i < candlesExec.length; i++) {
    const c = candlesExec[i]!;
    const stochA = ctx.stackExec.A[i] ?? 50;
    const stochAPrev = ctx.stackExec.A[i - 1] ?? stochA;

    if (open) {
      const liveChannel = channelAtTime(ctx, c.t);
      const oppositeRail =
        open.side === "long" ? liveChannel.upperAt(c.t) : liveChannel.lowerAt(c.t);
      const hit = checkK1ExitOnBar(open, i, c, stochA, stochAPrev, {
        timeStopBars: opts.timeStopBars,
        exitMode: opts.exitMode ?? "mvp",
        oppositeRailPrice: liveChannel.valid ? oppositeRail : open.tp2Price,
        stochMidExit: opts.stochMidExit,
      });
      if (hit.exit) {
        closePosition(i, hit.price, hit.reason);
      }
    }

    if (open) continue;

    const longEval = evaluateK1AtBar(candlesExec, ctx, i, "long", opts);
    const shortEval = evaluateK1AtBar(candlesExec, ctx, i, "short", opts);

    let side: K1Side | null = null;
    let steps = longEval.steps;
    if (longEval.allPass && shortEval.allPass) {
      side = preferLong ? "long" : "short";
      steps = preferLong ? longEval.steps : shortEval.steps;
    } else if (longEval.allPass) {
      side = "long";
      steps = longEval.steps;
    } else if (shortEval.allPass) {
      side = "short";
      steps = shortEval.steps;
    }

    if (!side) continue;
    signals++;

    const channel = channelAtTime(ctx, c.t);
    const prev = candlesExec[i - 1] ?? c;
    const oppositeRail = side === "long" ? channel.upperAt(c.t) : channel.lowerAt(c.t);
    const levels = buildK1EntryLevels({
      side,
      entryPrice: c.c,
      swingLow: Math.min(prev.l, c.l),
      swingHigh: Math.max(prev.h, c.h),
      channelMid: channel.midAt(c.t),
      oppositeRail: channel.valid ? oppositeRail : undefined,
      stopBufferPct,
    });
    if (!levels) continue;

    const qty = riskQty(equity, riskPct, maxLeverage, levels.entryPrice, levels.stopPrice);
    if (!(qty > 0)) continue;

    open = {
      ...levels,
      entryBar: i,
      entryTs: c.t,
      qty,
      steps,
    };
  }

  if (open && flattenEod && candlesExec.length > 0) {
    const last = candlesExec.length - 1;
    closePosition(last, candlesExec[last]!.c, "eod_flat");
  }

  return {
    symbol,
    structurePeriodMs,
    summary: summarizeK1Trades(symbol, candlesExec.length, trades, signals),
    trades,
    funnelSignals: signals,
  };
}
