import { candleStats, getCandles, getSymbolMeta } from "../store";
import type { GusParams } from "../types";
import { etDayKey } from "./clock";
import { buildDayContext } from "./day-context";
import {
  borrowCost,
  computeShareSize,
  coverFillPrice,
  DEFAULT_EQUITY,
  shortFillPrice,
} from "./fills";
import { summarize } from "./metrics";
import {
  detectConsolClockAfterPeak,
  isCrack,
  partialTriggerOk,
  pastClock,
  pushPct,
  stopPrice as calcStop,
  volFracAtClock,
} from "./signals";
import type {
  BacktestOptions,
  BacktestResult,
  DayResult,
  FillLeg,
  GusEvent,
  Trade,
} from "./types";

type Phase = "SCAN" | "PUSH" | "CONSOL" | "PARTIAL" | "FULL" | "FLAT";

function groupBarsByDay(bars: import("../types").DuxCandle[]): Map<string, import("../types").DuxCandle[]> {
  const map = new Map<string, import("../types").DuxCandle[]>();
  for (const b of bars) {
    const key = etDayKey(b.t);
    const arr = map.get(key) ?? [];
    arr.push(b);
    map.set(key, arr);
  }
  return map;
}

function priorDailyClose(symbol: string, dayBars: import("../types").DuxCandle[]) {
  const first = dayBars[0];
  if (!first) return null;
  const dailies = getCandles({ symbol, resolution: "1d", endTs: first.t });
  return [...dailies].reverse().find((d) => d.t < first.t) ?? null;
}

export function runDay(
  symbol: string,
  dayBars: import("../types").DuxCandle[],
  params: GusParams,
  equity: number
): DayResult {
  const events: GusEvent[] = [];
  const meta = getSymbolMeta(symbol);
  const prior = priorDailyClose(symbol, dayBars);
  const ctx = buildDayContext({
    symbol,
    params,
    bars1m: dayBars,
    priorDaily: prior,
    meta,
  });
  events.push(...ctx.journal);

  if (ctx.skipReason) {
    return {
      symbol,
      dayKey: ctx.dayKey,
      skipReason: ctx.skipReason,
      trades: [],
      events,
      sizeMult: ctx.sizeMult,
      ctx,
    };
  }

  const rth = dayBars.filter((b) => b.session === "rth");
  if (rth.length < 30) {
    events.push({ t: dayBars[0]?.t ?? 0, type: "skip_no_rth" });
    return {
      symbol,
      dayKey: ctx.dayKey,
      skipReason: "no_entry",
      trades: [],
      events,
      sizeMult: ctx.sizeMult,
      ctx,
    };
  }

  let sizeMult = ctx.sizeMult;
  const vf = volFracAtClock(rth, ctx.pmVolume, ctx.eDayVol, params.t_clock);
  if (vf != null) {
    events.push({ t: rth[0]!.t, type: "vol_frac", detail: { vf, t_clock: params.t_clock } });
    if (vf < params.vol_frac_min || (params.vol_frac_max != null && vf > params.vol_frac_max)) {
      if (params.vol_clock_action === "block") {
        return {
          symbol,
          dayKey: ctx.dayKey,
          skipReason: "vol_clock_block",
          trades: [],
          events: [...events, { t: rth[0]!.t, type: "skip_vol_clock", detail: { vf } }],
          sizeMult,
          ctx,
        };
      }
      if (params.vol_clock_action === "size_down") {
        sizeMult *= 0.5;
        events.push({ t: rth[0]!.t, type: "vol_clock_size_down", detail: { vf } });
      }
    }
  }

  const pushBasePrice = ctx.rthOpen;
  let phase: Phase = "SCAN";
  let hod = ctx.rthOpen;
  let peakIdx = 0;
  let pushExt = ctx.rthOpen;
  let consol: ReturnType<typeof detectConsolClockAfterPeak> = null;
  let stopPx = 0;
  let targetShares = 0;
  let shares = 0;
  let entryNotional = 0;
  let entryTs = 0;
  let avgEntry = 0;
  const legs: FillLeg[] = [];
  const trades: Trade[] = [];
  let pendingShort: { shares: number; reason: string } | null = null;
  let ladderIdx = 0;
  let entryWindowEnded = false;
  let skipCoverAdvance = false;

  const finalizeTrade = (exitTs: number, exitReason: string) => {
    if (legs.filter((l) => l.side === "short").length === 0) return;
    const shorted = legs.filter((l) => l.side === "short").reduce((s, l) => s + l.shares, 0);
    const covered = legs.filter((l) => l.side === "cover").reduce((s, l) => s + l.shares, 0);
    const shortCostBasis = legs
      .filter((l) => l.side === "short")
      .reduce((s, l) => s + l.price * l.shares, 0);
    const coverCost = legs
      .filter((l) => l.side === "cover")
      .reduce((s, l) => s + l.price * l.shares, 0);
    let pnl = shortCostBasis - coverCost;
    pnl -= borrowCost(shorted, shorted > 0 ? shortCostBasis / shorted : pushBasePrice, params, 1);
    const entryAvg = shorted > 0 ? shortCostBasis / shorted : avgEntry;
    const exitAvg = covered > 0 ? coverCost / covered : 0;
    const riskDollars = Math.abs(stopPx - entryAvg) * shorted;
    const rMultiple = riskDollars > 0 ? pnl / riskDollars : null;
    trades.push({
      symbol,
      entryTs,
      exitTs,
      avgEntry: entryAvg,
      avgExit: exitAvg,
      shares: shorted,
      pnl,
      riskDollars,
      rMultiple,
      exitReason,
      legs: [...legs],
    });
    shares = 0;
    legs.length = 0;
    entryNotional = 0;
    avgEntry = 0;
    entryTs = 0;
    phase = "FLAT";
  };

  const coverAll = (barOpen: number, t: number, reason: string) => {
    if (shares <= 0) return;
    const px = coverFillPrice(barOpen, params);
    legs.push({ t, side: "cover", shares, price: px, reason });
    events.push({ t, type: "cover", detail: { shares, price: px, reason } });
    shares = 0;
    finalizeTrade(t, reason);
  };

  const coverPartial = (barOpen: number, t: number, qty: number, reason: string) => {
    if (shares <= 0 || qty <= 0) return;
    const q = Math.min(shares, qty);
    const px = coverFillPrice(barOpen, params);
    legs.push({ t, side: "cover", shares: q, price: px, reason });
    events.push({ t, type: "cover_partial", detail: { shares: q, price: px, reason } });
    shares -= q;
    if (shares <= 0) finalizeTrade(t, reason);
  };

  for (let i = 0; i < rth.length; i++) {
    if (skipCoverAdvance) {
      skipCoverAdvance = false;
    }
    const bar = rth[i]!;
    const next = rth[i + 1];

    if (pendingShort) {
      const px = shortFillPrice(bar.o, params);
      const q = pendingShort.shares;
      legs.push({ t: bar.t, side: "short", shares: q, price: px, reason: pendingShort.reason });
      events.push({ t: bar.t, type: "short", detail: { shares: q, price: px, reason: pendingShort.reason } });
      entryNotional += px * q;
      shares += q;
      avgEntry = entryNotional / shares;
      if (!entryTs) entryTs = bar.t;
      pendingShort = null;
      if (phase === "CONSOL" || phase === "PUSH") phase = "PARTIAL";
      if (targetShares > 0 && shares >= targetShares * 0.99) phase = "FULL";
    }

    if (shares > 0) {
      // With buffer 0, require trade strictly above consol high (touching the box high is OK).
      const stopHit = params.stop_buffer_pct > 0 ? bar.h >= stopPx : bar.h > stopPx;
      if (stopHit) {
        if (next) {
          coverAll(next.o, next.t, "stop");
          skipCoverAdvance = true;
          i++;
          continue;
        }
        coverAll(bar.c, bar.t, "stop");
        break;
      }

      if (params.target_mode === "scale_ladder" && avgEntry > 0) {
        while (ladderIdx < params.scale_ladder_pcts.length && shares > 0) {
          const fade = params.scale_ladder_pcts[ladderIdx]!;
          const level = avgEntry * (1 - fade);
          if (bar.l <= level) {
            const portion = Math.max(1, Math.floor(targetShares / params.scale_ladder_pcts.length));
            const fillBar = next ?? bar;
            coverPartial(fillBar.o, fillBar.t, portion, `ladder_${fade}`);
            ladderIdx++;
          } else break;
        }
      } else if (params.target_mode === "fade_pct" && avgEntry > 0) {
        const level = avgEntry * (1 - params.target_fade_pct);
        if (bar.l <= level) {
          const fillBar = next ?? bar;
          coverAll(fillBar.o, fillBar.t, "fade_target");
        }
      }

      if (shares > 0 && params.eod_flat && pastClock(bar.t, params.t_flat)) {
        const fillBar = next ?? bar;
        coverAll(fillBar.o, fillBar.t, "eod_flat");
        break;
      }
      if (shares <= 0) continue;
    }

    if (phase === "FLAT") continue;
    if (pastClock(bar.t, params.entry_window_end)) entryWindowEnded = true;

    if (bar.h > hod) {
      hod = bar.h;
      peakIdx = i;
      pushExt = hod;
    }
    const pPct = pushPct(pushExt, pushBasePrice);

    if (phase === "SCAN") {
      if (pPct >= params.push_min && (params.push_max == null || pPct <= params.push_max)) {
        phase = "PUSH";
        events.push({ t: bar.t, type: "push_ok", detail: { pushPct: pPct, pushExt } });
      }
    }

    // Freeze first valid consol box after push (do not let crack bars rewrite the box).
    if (phase === "PUSH" && !consol) {
      const box = detectConsolClockAfterPeak(rth, peakIdx, params, i);
      if (box) {
        consol = box;
        phase = "CONSOL";
        events.push({
          t: bar.t,
          type: "consol",
          detail: { high: box.high, low: box.low, widthPct: box.widthPct, lenMin: box.lenMin },
        });
      }
    }

    if ((phase === "CONSOL" || phase === "PARTIAL") && consol && !entryWindowEnded) {
      stopPx = calcStop(consol, pushExt, params);
      const riskPct = Math.abs(stopPx - bar.c) / Math.max(bar.c, 1e-9);
      if (riskPct > params.max_risk_pct) {
        events.push({ t: bar.t, type: "reject_stop_risk", detail: { riskPct, stopPx } });
      } else {
        if (targetShares === 0) {
          targetShares = computeShareSize({
            params,
            equity,
            sizeMult,
            entryPrice: shortFillPrice(bar.c, params),
            stopPrice: stopPx,
            floatShares: ctx.floatShares,
            eDayVol: ctx.eDayVol,
          });
        }

        // Partial: clock_10_11 may already be past when consol first validates —
        // allow partial in the first 15m after consol forms if still before entry_window_end.
        if (targetShares > 0 && phase === "CONSOL" && params.partial_frac > 0 && !pendingShort) {
          const prev = i > 0 ? rth[i - 1]! : null;
          const clockOk = partialTriggerOk(bar, prev, consol, params);
          const latePartial =
            params.partial_trigger === "clock_10_11" &&
            i > 0 &&
            bar.t >= consol.endTs &&
            !pastClock(bar.t, params.entry_window_end);
          if ((clockOk || latePartial) && next) {
            const q = Math.max(1, Math.floor(targetShares * params.partial_frac));
            pendingShort = { shares: q, reason: "partial" };
            events.push({ t: bar.t, type: "signal_partial", detail: { shares: q, late: latePartial } });
            phase = "PARTIAL";
          }
        }

        if (targetShares > 0 && (phase === "CONSOL" || phase === "PARTIAL") && isCrack(bar, consol, params)) {
          const already = shares + (pendingShort?.shares ?? 0);
          const q = Math.max(0, targetShares - already);
          if (q > 0 && next) {
            pendingShort = {
              shares: (pendingShort?.shares ?? 0) + q,
              reason: pendingShort ? "partial+crack" : "crack",
            };
            events.push({ t: bar.t, type: "signal_crack", detail: { shares: q } });
          }
        }
      }
    }
  }

  if (shares > 0) {
    const last = rth[rth.length - 1]!;
    coverAll(last.c, last.t, "session_end");
  }

  if (trades.length === 0 && !ctx.skipReason) {
    events.push({ t: rth[rth.length - 1]?.t ?? 0, type: "no_entry" });
  }

  return {
    symbol,
    dayKey: ctx.dayKey,
    skipReason: trades.length > 0 ? null : ctx.skipReason ?? "no_entry",
    trades,
    events,
    sizeMult,
    ctx,
  };
}

function listSymbols(filter?: string[]): string[] {
  if (filter?.length) return filter;
  return [...new Set(candleStats().filter((s) => s.resolution === "1m").map((r) => r.symbol))];
}

export function runBacktest(params: GusParams, options: BacktestOptions = {}): BacktestResult {
  const equity = options.equity ?? DEFAULT_EQUITY;
  const days: DayResult[] = [];

  for (const symbol of listSymbols(options.symbols)) {
    const bars = getCandles({ symbol, resolution: "1m" });
    const byDay = groupBarsByDay(bars);
    for (const [, dayBars] of byDay) {
      if (!dayBars.some((b) => b.session === "rth" || b.session === "pm")) continue;
      days.push(runDay(symbol, dayBars, params, equity));
    }
  }

  const trades = days.flatMap((d) => d.trades);
  return {
    params,
    equityStart: equity,
    days,
    trades,
    summary: summarize(days, trades),
  };
}

export function runBacktestOnSymbols(
  params: GusParams,
  symbols: string[],
  equity = DEFAULT_EQUITY
): BacktestResult {
  return runBacktest(params, { symbols, equity });
}
