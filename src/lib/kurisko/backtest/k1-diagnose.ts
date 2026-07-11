import type { LighterCandle } from "@/lib/lighter/client";
import { riskQty } from "@/lib/aziz/backtest/engine-common";
import {
  KURISKO_DEFAULT_CHANNEL_TOUCH_PCT,
  KURISKO_DEFAULT_REQUIRE_REVERSAL_CANDLE,
  KURISKO_DEFAULT_REQUIRE_VWAP,
  KURISKO_DEFAULT_VWAP_TOUCH_PCT,
  KURISKO_STOCH_PARAMS,
  KURISKO_STOCH_THRESH_OVERBOUGHT,
  KURISKO_STOCH_THRESH_OVERSOLD,
} from "../constants";
import {
  channelValidDown,
  channelValidUp,
  lowerRailContextOk,
  upperRailContextOk,
} from "../indicators/channel-geometry";
import { bearishDivergenceAtRail, bearishDivergenceRecent, bullishDivergenceAtRail, bullishDivergenceRecent } from "../indicators/divergence";
import {
  KURISKO_BEAR_REVERSAL_LABELS,
  KURISKO_BULL_REVERSAL_LABELS,
  bearishReversalRecent,
  bullishReversalRecent,
} from "../indicators/reversal-candles";
import { isFirstVwapTouch, vwapConfluenceLong, vwapConfluenceShort } from "../indicators/vwap-touch";
import {
  quadOversoldWithin,
  quadOverboughtWithin,
  stochHooksDown,
  stochHooksUp,
  type QuadStochStack,
} from "../indicators/stochastic-quad";
import { buildDualTfContext, channelAtTime, structureIndexAt, type KuriskoDualTfContext } from "./dual-tf-context";

export interface K1CriterionStep {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

export interface K1FunnelStats {
  bars: number;
  channelValidDown: number;
  atLowerRail: number;
  structQuadOs: number;
  execQuadOs: number;
  bullishDiv: number;
  stochHookUp: number;
  vwapConfluenceLong: number;
  reversalCandleLong: number;
  longSizingOk: number;
  channelValidUp: number;
  atUpperRail: number;
  structQuadOb: number;
  execQuadOb: number;
  bearishDiv: number;
  stochHookDown: number;
  vwapConfluenceShort: number;
  reversalCandleShort: number;
  shortSizingOk: number;
}

export interface K1DiagnoseOpts {
  touchPct?: number;
  vwapTouchPct?: number;
  requireVwapConfluence?: boolean;
  requireReversalCandle?: boolean;
  equity?: number;
  riskPct?: number;
  maxLeverage?: number;
}

export interface K1BestMatch {
  side: "long" | "short";
  barIndex: number;
  ts: number;
  passCount: number;
  totalSteps: number;
  steps: K1CriterionStep[];
  allPass: boolean;
}

function quadDetail(stack: QuadStochStack, i: number): string {
  return KURISKO_STOCH_PARAMS.map(({ key, period, smooth }) =>
    `${period},${smooth}=%D ${(stack[key][i] ?? 0).toFixed(1)}`
  ).join(" · ");
}

function quadOsDetail(stack: QuadStochStack, end: number, lookback: number): string {
  const start = Math.max(0, end - lookback + 1);
  for (let i = end; i >= start; i--) {
    const allOs = KURISKO_STOCH_PARAMS.every(
      ({ key }) => (stack[key][i] ?? 50) < KURISKO_STOCH_THRESH_OVERSOLD
    );
    if (allOs) return `Full quad OS at bar −${end - i}: ${quadDetail(stack, i)}`;
  }
  const fastA = stack.A[end] ?? 0;
  const fastB = stack.B[end] ?? 0;
  const fastPair = fastA < 20 && fastB < 20;
  return `No full quad OS in last ${lookback} bars — fast pair (9,3+14,3): ${fastPair ? "yes" : "no"} · now: ${quadDetail(stack, end)}`;
}

function quadObDetail(stack: QuadStochStack, end: number, lookback: number): string {
  const start = Math.max(0, end - lookback + 1);
  for (let i = end; i >= start; i--) {
    const allOb = KURISKO_STOCH_PARAMS.every(
      ({ key }) => (stack[key][i] ?? 50) > KURISKO_STOCH_THRESH_OVERBOUGHT
    );
    if (allOb) return `Quad OB at bar −${end - i}: ${quadDetail(stack, i)}`;
  }
  return `No quad OB in last ${lookback} bars — now: ${quadDetail(stack, end)}`;
}

function evaluateK1LongSteps(
  candlesExec: LighterCandle[],
  ctx: KuriskoDualTfContext,
  i: number,
  opts: K1DiagnoseOpts
): K1CriterionStep[] {
  const touchPct = opts.touchPct ?? KURISKO_DEFAULT_CHANNEL_TOUCH_PCT;
  const vwapTouchPct = opts.vwapTouchPct ?? KURISKO_DEFAULT_VWAP_TOUCH_PCT;
  const requireVwap = opts.requireVwapConfluence ?? KURISKO_DEFAULT_REQUIRE_VWAP;
  const requireReversal = opts.requireReversalCandle ?? KURISKO_DEFAULT_REQUIRE_REVERSAL_CANDLE;
  const equity = opts.equity ?? 1000;
  const riskPct = opts.riskPct ?? 2;
  const maxLeverage = opts.maxLeverage ?? 5;
  const c = candlesExec[i]!;
  const idxStruct = structureIndexAt(ctx, c.t);
  const channel = channelAtTime(ctx, c.t);
  const steps: K1CriterionStep[] = [];

  const chDown = channelValidDown(channel);
  const slopeDn = channel.slopeDeg;
  steps.push({
    id: "channel_down",
    label: "K1_E1 — Valid descending channel (structure TF)",
    pass: chDown,
    detail: chDown
      ? `1-2-3 parallel channel slopes down (${slopeDn?.toFixed(1) ?? "?"}°)`
      : !channel.valid
        ? "No valid parallel channel from structure pivots"
        : channel.direction !== "down"
          ? `Channel is "${channel.direction}" — K1 long needs descending (down) channel`
          : `Descending channel slope ${slopeDn?.toFixed(1) ?? "?"}° outside 15°–40° (RAG CHANNEL_SLOPE_OK)`,
  });

  const lowerRail = lowerRailContextOk(candlesExec, i, channel, touchPct);
  const railPrice = channel.lowerAt(c.t);
  const distPct = railPrice > 0 ? (Math.abs(Math.min(c.l, c.c) - railPrice) / c.c) * 100 : 0;
  steps.push({
    id: "lower_rail",
    label: `K1_E2 — Price at/near lower rail (±${(touchPct * 200).toFixed(2)}%, incl. recent touch)`,
    pass: lowerRail,
    detail: lowerRail
      ? `Low/body ${Math.min(c.l, c.c).toFixed(2)} near rail ${railPrice.toFixed(2)}`
      : `Low/body ${Math.min(c.l, c.c).toFixed(2)} is ${distPct.toFixed(3)}% from lower rail ${railPrice.toFixed(2)}`,
  });

  const structQuad = idxStruct >= 0 && quadOversoldWithin(ctx.stackStruct, idxStruct, 3);
  steps.push({
    id: "struct_quad_os",
    label: "K1_E3 — Structure TF full quad OS (9,3·14,3·34,3·60,10 < 20, last 3 bars)",
    pass: structQuad,
    detail: idxStruct >= 0 ? quadOsDetail(ctx.stackStruct, idxStruct, 3) : "Structure bar not mapped",
  });

  const execQuad = quadOversoldWithin(ctx.stackExec, i, 5);
  steps.push({
    id: "exec_quad_os",
    label: "K1_E4 — Execution TF full quad OS (9,3·14,3·34,3·60,10 < 20, last 5 bars)",
    pass: execQuad,
    detail: quadOsDetail(ctx.stackExec, i, 5),
  });

  const div = bullishDivergenceRecent(candlesExec, ctx.stackExec, channel, i, 20, touchPct);
  const divNow = bullishDivergenceAtRail(candlesExec, ctx.stackExec, channel, i, 20, touchPct);
  const stochA = ctx.stackExec.A[i] ?? 0;
  steps.push({
    id: "bull_div",
    label: "K1_E5 — Bullish divergence at lower rail (STOCH_A, last 10 bars)",
    pass: div,
    detail: div
      ? `${divNow ? "Divergence on this bar" : "Divergence within last 10 bars"} — STOCH_A=${stochA.toFixed(1)}`
      : `No bullish divergence — STOCH_A=${stochA.toFixed(1)}`,
  });

  const hook = stochHooksUp(ctx.stackExec, i);
  const prevA = ctx.stackExec.A[i - 1] ?? 0;
  steps.push({
    id: "hook_up",
    label: "Trigger — Fast STOCH (9,3) hooks up from ≤30",
    pass: hook,
    detail: hook
      ? `STOCH_A ${prevA.toFixed(1)} → ${stochA.toFixed(1)}`
      : `STOCH_A ${prevA.toFixed(1)} → ${stochA.toFixed(1)} (need rise from ≤30)`,
  });

  const vwap = ctx.sessionVwap[i] ?? 0;
  const vwapOk = vwapConfluenceLong(candlesExec, ctx.sessionVwap, ctx.isNewDay, i, vwapTouchPct);
  const firstTouch = isFirstVwapTouch(candlesExec, ctx.sessionVwap, ctx.isNewDay, i, "from_above", vwapTouchPct);
  steps.push({
    id: "vwap_long",
    label: `Quad pillar — VWAP confluence${requireVwap ? " (required)" : " (bonus)"}`,
    pass: !requireVwap || vwapOk,
    detail: vwapOk
      ? `${firstTouch ? "First session touch from above" : "Near session VWAP"} @ ${vwap.toFixed(2)}`
      : `VWAP ${vwap.toFixed(2)} — no first-touch / near-VWAP confluence`,
  });

  const reversal = bullishReversalRecent(candlesExec, i);
  steps.push({
    id: "reversal_long",
    label: `Quad pillar — Reversal candle${requireReversal ? " (required)" : " (bonus)"}`,
    pass: !requireReversal || reversal != null,
    detail: reversal
      ? `Pattern: ${reversal.label}`
      : `None of: ${KURISKO_BULL_REVERSAL_LABELS}`,
  });

  const swingLow = Math.min(candlesExec[i - 1]?.l ?? c.l, c.l);
  const stop = swingLow * (1 - 0.0005);
  const entry = c.c;
  const target = channel.midAt(c.t);
  const qty = riskQty(equity, riskPct, maxLeverage, entry, stop);
  const sizingOk = qty > 0 && target > entry;
  steps.push({
    id: "sizing",
    label: "Risk sizing & R:R (target = channel mid)",
    pass: sizingOk,
    detail: sizingOk
      ? `Entry ${entry.toFixed(2)} · stop ${stop.toFixed(2)} · target ${target.toFixed(2)} · qty ${qty.toFixed(3)}`
      : `Entry ${entry.toFixed(2)} · target ${target.toFixed(2)} — ${target <= entry ? "target not above entry" : "qty=0 (stop too wide?)"}`,
  });

  return steps;
}

function evaluateK1ShortSteps(
  candlesExec: LighterCandle[],
  ctx: KuriskoDualTfContext,
  i: number,
  opts: K1DiagnoseOpts
): K1CriterionStep[] {
  const touchPct = opts.touchPct ?? KURISKO_DEFAULT_CHANNEL_TOUCH_PCT;
  const vwapTouchPct = opts.vwapTouchPct ?? KURISKO_DEFAULT_VWAP_TOUCH_PCT;
  const requireVwap = opts.requireVwapConfluence ?? KURISKO_DEFAULT_REQUIRE_VWAP;
  const requireReversal = opts.requireReversalCandle ?? KURISKO_DEFAULT_REQUIRE_REVERSAL_CANDLE;
  const equity = opts.equity ?? 1000;
  const riskPct = opts.riskPct ?? 2;
  const maxLeverage = opts.maxLeverage ?? 5;
  const c = candlesExec[i]!;
  const idxStruct = structureIndexAt(ctx, c.t);
  const channel = channelAtTime(ctx, c.t);
  const steps: K1CriterionStep[] = [];

  const chUp = channelValidUp(channel);
  const slope = channel.slopeDeg;
  steps.push({
    id: "channel_up",
    label: "K1_E1 — Valid ascending channel (structure TF)",
    pass: chUp,
    detail: chUp
      ? `1-2-3 parallel channel slopes up (${slope?.toFixed(1) ?? "?"}°)`
      : !channel.valid
        ? "No valid parallel channel from structure pivots"
        : channel.direction !== "up"
          ? `Channel is "${channel.direction}" — K1 short needs ascending (up) channel`
          : `Ascending channel slope ${slope?.toFixed(1) ?? "?"}° outside 15°–40° (RAG CHANNEL_SLOPE_OK)`,
  });

  const upperRail = upperRailContextOk(candlesExec, i, channel, touchPct);
  const railPrice = channel.upperAt(c.t);
  const distPct = railPrice > 0 ? (Math.abs(Math.max(c.h, c.c) - railPrice) / c.c) * 100 : 0;
  steps.push({
    id: "upper_rail",
    label: `K1_E2 — Price at/near upper rail (±${(touchPct * 200).toFixed(2)}%, incl. recent touch)`,
    pass: upperRail,
    detail: upperRail
      ? `High/body ${Math.max(c.h, c.c).toFixed(2)} near rail ${railPrice.toFixed(2)}`
      : `High/body ${Math.max(c.h, c.c).toFixed(2)} is ${distPct.toFixed(3)}% from upper rail ${railPrice.toFixed(2)}`,
  });

  const structQuad = idxStruct >= 0 && quadOverboughtWithin(ctx.stackStruct, idxStruct, 3);
  steps.push({
    id: "struct_quad_ob",
    label: "K1_E3 — Structure TF quad overbought (4 stochs > 80, last 3 bars)",
    pass: structQuad,
    detail: idxStruct >= 0 ? quadObDetail(ctx.stackStruct, idxStruct, 3) : "Structure bar not mapped",
  });

  const execQuad = quadOverboughtWithin(ctx.stackExec, i, 5);
  steps.push({
    id: "exec_quad_ob",
    label: "K1_E4 — Execution TF quad overbought (4 stochs > 80, last 5 bars)",
    pass: execQuad,
    detail: quadObDetail(ctx.stackExec, i, 5),
  });

  const div = bearishDivergenceRecent(candlesExec, ctx.stackExec, channel, i, 20, touchPct);
  const divNow = bearishDivergenceAtRail(candlesExec, ctx.stackExec, channel, i, 20, touchPct);
  const stochA = ctx.stackExec.A[i] ?? 100;
  steps.push({
    id: "bear_div",
    label: "K1_E5 — Bearish divergence at upper rail (STOCH_A, last 10 bars)",
    pass: div,
    detail: div
      ? `${divNow ? "Divergence on this bar" : "Divergence within last 10 bars"} — STOCH_A=${stochA.toFixed(1)}`
      : `No bearish divergence — STOCH_A=${stochA.toFixed(1)}`,
  });

  const hook = stochHooksDown(ctx.stackExec, i);
  const prevA = ctx.stackExec.A[i - 1] ?? 100;
  steps.push({
    id: "hook_down",
    label: "Trigger — STOCH_A hooks down from ≥70",
    pass: hook,
    detail: hook
      ? `STOCH_A ${prevA.toFixed(1)} → ${stochA.toFixed(1)}`
      : `STOCH_A ${prevA.toFixed(1)} → ${stochA.toFixed(1)} (need fall from ≥70)`,
  });

  const vwap = ctx.sessionVwap[i] ?? 0;
  const vwapOk = vwapConfluenceShort(candlesExec, ctx.sessionVwap, ctx.isNewDay, i, vwapTouchPct);
  const firstTouch = isFirstVwapTouch(candlesExec, ctx.sessionVwap, ctx.isNewDay, i, "from_below", vwapTouchPct);
  steps.push({
    id: "vwap_short",
    label: `Quad pillar — VWAP confluence${requireVwap ? " (required)" : " (bonus)"}`,
    pass: !requireVwap || vwapOk,
    detail: vwapOk
      ? `${firstTouch ? "First session touch from below" : "Near session VWAP"} @ ${vwap.toFixed(2)}`
      : `VWAP ${vwap.toFixed(2)} — no first-touch / near-VWAP confluence`,
  });

  const reversal = bearishReversalRecent(candlesExec, i);
  steps.push({
    id: "reversal_short",
    label: `Quad pillar — Reversal candle${requireReversal ? " (required)" : " (bonus)"}`,
    pass: !requireReversal || reversal != null,
    detail: reversal
      ? `Pattern: ${reversal.label}`
      : `None of: ${KURISKO_BEAR_REVERSAL_LABELS}`,
  });

  const swingHigh = Math.max(candlesExec[i - 1]?.h ?? c.h, c.h);
  const stop = swingHigh * (1 + 0.0005);
  const entry = c.c;
  const target = channel.midAt(c.t);
  const qty = riskQty(equity, riskPct, maxLeverage, entry, stop);
  const sizingOk = qty > 0 && target < entry;
  steps.push({
    id: "sizing",
    label: "Risk sizing & R:R (target = channel mid)",
    pass: sizingOk,
    detail: sizingOk
      ? `Entry ${entry.toFixed(2)} · stop ${stop.toFixed(2)} · target ${target.toFixed(2)} · qty ${qty.toFixed(3)}`
      : `Entry ${entry.toFixed(2)} · target ${target.toFixed(2)} — ${target >= entry ? "target not below entry" : "qty=0 (stop too wide?)"}`,
  });

  return steps;
}

function stepsSummary(steps: K1CriterionStep[], opts: K1DiagnoseOpts): { passCount: number; allPass: boolean } {
  const requireVwap = opts.requireVwapConfluence ?? KURISKO_DEFAULT_REQUIRE_VWAP;
  const requireReversal = opts.requireReversalCandle ?? KURISKO_DEFAULT_REQUIRE_REVERSAL_CANDLE;
  const coreIds = new Set([
    "channel_down",
    "channel_up",
    "lower_rail",
    "upper_rail",
    "struct_quad_os",
    "struct_quad_ob",
    "exec_quad_os",
    "exec_quad_ob",
    "bull_div",
    "bear_div",
    "hook_up",
    "hook_down",
    "sizing",
    ...(requireVwap ? (["vwap_long", "vwap_short"] as const) : []),
    ...(requireReversal ? (["reversal_long", "reversal_short"] as const) : []),
  ]);
  const relevant = steps.filter((s) => coreIds.has(s.id));
  const passCount = relevant.filter((s) => s.pass).length;
  return { passCount, allPass: passCount === relevant.length };
}

/** Gate counts across the window — explains 0-trade backtests. */
export function diagnoseK1Funnel(
  candlesExec: LighterCandle[],
  structurePeriodMs: number,
  opts: K1DiagnoseOpts = {}
): K1FunnelStats {
  const touchPct = opts.touchPct ?? KURISKO_DEFAULT_CHANNEL_TOUCH_PCT;
  const vwapTouchPct = opts.vwapTouchPct ?? KURISKO_DEFAULT_VWAP_TOUCH_PCT;
  const equity = opts.equity ?? 1000;
  const riskPct = opts.riskPct ?? 2;
  const maxLeverage = opts.maxLeverage ?? 5;
  const ctx = buildDualTfContext(candlesExec, structurePeriodMs);

  const stats: K1FunnelStats = {
    bars: candlesExec.length,
    channelValidDown: 0,
    atLowerRail: 0,
    structQuadOs: 0,
    execQuadOs: 0,
    bullishDiv: 0,
    stochHookUp: 0,
    vwapConfluenceLong: 0,
    reversalCandleLong: 0,
    longSizingOk: 0,
    channelValidUp: 0,
    atUpperRail: 0,
    structQuadOb: 0,
    execQuadOb: 0,
    bearishDiv: 0,
    stochHookDown: 0,
    vwapConfluenceShort: 0,
    reversalCandleShort: 0,
    shortSizingOk: 0,
  };

  for (let i = 80; i < candlesExec.length; i++) {
    const c = candlesExec[i]!;
    const idxStruct = structureIndexAt(ctx, c.t);
    if (idxStruct < 0) continue;
    const channel = channelAtTime(ctx, c.t);

    if (channelValidDown(channel)) {
      stats.channelValidDown++;
      if (lowerRailContextOk(candlesExec, i, channel, touchPct)) {
        stats.atLowerRail++;
        if (quadOversoldWithin(ctx.stackStruct, idxStruct, 3)) {
          stats.structQuadOs++;
          if (quadOversoldWithin(ctx.stackExec, i, 5)) {
            stats.execQuadOs++;
            if (bullishDivergenceRecent(candlesExec, ctx.stackExec, channel, i, 20, touchPct)) {
              stats.bullishDiv++;
              if (stochHooksUp(ctx.stackExec, i)) {
                stats.stochHookUp++;
                const requireVwap = opts.requireVwapConfluence ?? KURISKO_DEFAULT_REQUIRE_VWAP;
                const requireRev = opts.requireReversalCandle ?? KURISKO_DEFAULT_REQUIRE_REVERSAL_CANDLE;
                const vwapOk = vwapConfluenceLong(candlesExec, ctx.sessionVwap, ctx.isNewDay, i, vwapTouchPct);
                if (vwapOk) stats.vwapConfluenceLong++;
                if (!requireVwap || vwapOk) {
                  const rev = bullishReversalRecent(candlesExec, i);
                  if (rev) stats.reversalCandleLong++;
                  if (!requireRev || rev) {
                    const steps = evaluateK1LongSteps(candlesExec, ctx, i, opts);
                    if (stepsSummary(steps, opts).allPass) stats.longSizingOk++;
                  }
                }
              }
            }
          }
        }
      }
    }

    if (channelValidUp(channel)) {
      stats.channelValidUp++;
      if (upperRailContextOk(candlesExec, i, channel, touchPct)) {
        stats.atUpperRail++;
        if (quadOverboughtWithin(ctx.stackStruct, idxStruct, 3)) {
          stats.structQuadOb++;
          if (quadOverboughtWithin(ctx.stackExec, i, 5)) {
            stats.execQuadOb++;
            if (bearishDivergenceRecent(candlesExec, ctx.stackExec, channel, i, 20, touchPct)) {
              stats.bearishDiv++;
              if (stochHooksDown(ctx.stackExec, i)) {
                stats.stochHookDown++;
                const requireVwap = opts.requireVwapConfluence ?? KURISKO_DEFAULT_REQUIRE_VWAP;
                const requireRev = opts.requireReversalCandle ?? KURISKO_DEFAULT_REQUIRE_REVERSAL_CANDLE;
                const vwapOk = vwapConfluenceShort(candlesExec, ctx.sessionVwap, ctx.isNewDay, i, vwapTouchPct);
                if (vwapOk) stats.vwapConfluenceShort++;
                if (!requireVwap || vwapOk) {
                  const rev = bearishReversalRecent(candlesExec, i);
                  if (rev) stats.reversalCandleShort++;
                  if (!requireRev || rev) {
                    const steps = evaluateK1ShortSteps(candlesExec, ctx, i, opts);
                    if (stepsSummary(steps, opts).allPass) stats.shortSizingOk++;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return stats;
}

/** Bar with the most criteria met — best tuning reference when no trades fire. */
export function diagnoseK1BestMatch(
  candlesExec: LighterCandle[],
  structurePeriodMs: number,
  opts: K1DiagnoseOpts = {}
): K1BestMatch | null {
  const ctx = buildDualTfContext(candlesExec, structurePeriodMs);

  let best: K1BestMatch | null = null;

  for (let i = 80; i < candlesExec.length; i++) {
    const c = candlesExec[i]!;
    for (const side of ["long", "short"] as const) {
      const steps =
        side === "long"
          ? evaluateK1LongSteps(candlesExec, ctx, i, opts)
          : evaluateK1ShortSteps(candlesExec, ctx, i, opts);
      const { passCount, allPass } = stepsSummary(steps, opts);
      if (
        !best ||
        passCount > best.passCount ||
        (passCount === best.passCount && i > best.barIndex)
      ) {
        best = {
          side,
          barIndex: i,
          ts: c.t,
          passCount,
          totalSteps: steps.length,
          steps,
          allPass,
        };
      }
    }
  }

  return best;
}

/** Per-criterion evaluation on the latest execution bar. */
export function diagnoseK1LatestBar(
  candlesExec: LighterCandle[],
  structurePeriodMs: number,
  opts: K1DiagnoseOpts = {}
): { longSteps: K1CriterionStep[]; shortSteps: K1CriterionStep[]; preferredSide: "long" | "short" } {
  if (candlesExec.length < 81) {
    const warmup = {
      id: "warmup",
      label: "Enough history",
      pass: false,
      detail: `Need 80+ execution bars (have ${candlesExec.length})`,
    };
    return { longSteps: [warmup], shortSteps: [warmup], preferredSide: "long" };
  }

  const ctx = buildDualTfContext(candlesExec, structurePeriodMs);
  const i = candlesExec.length - 1;
  const longSteps = evaluateK1LongSteps(candlesExec, ctx, i, opts);
  const shortSteps = evaluateK1ShortSteps(candlesExec, ctx, i, opts);
  const longPasses = longSteps.filter((s) => s.pass).length;
  const shortPasses = shortSteps.filter((s) => s.pass).length;
  const latestChannel = channelAtTime(ctx, candlesExec[i]!.t);
  const preferredSide: "long" | "short" =
    shortPasses > longPasses ? "short" : longPasses > shortPasses ? "long" : latestChannel.direction === "up" ? "short" : "long";

  return { longSteps, shortSteps, preferredSide };
}

export function diagnoseK1(
  candlesExec: LighterCandle[],
  structurePeriodMs: number,
  opts: K1DiagnoseOpts = {}
) {
  return {
    funnel: diagnoseK1Funnel(candlesExec, structurePeriodMs, opts),
    bestMatch: diagnoseK1BestMatch(candlesExec, structurePeriodMs, opts),
    latestBar: diagnoseK1LatestBar(candlesExec, structurePeriodMs, opts),
  };
}
