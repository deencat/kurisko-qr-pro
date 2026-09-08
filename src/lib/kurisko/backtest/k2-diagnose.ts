/**
 * K2 — 20/20 Bull Flag diagnose engine (RAG STRATEGY K2).
 * Continuation long: 5m EMBEDDED_BULL (60,10) + 1m flagpole/pullback + 9,3 hook.
 */
import type { LighterCandle } from "@/lib/lighter/client";
import {
  KURISKO_DEFAULT_EMBED_BARS_5M,
  KURISKO_DEFAULT_STOP_BUFFER_PCT,
} from "../constants";
import { channelValidUp } from "../indicators/channel-geometry";
import { allStepsPass, countPassingSteps, type KuriskoCriterionStep } from "./criterion-step";
import { buildDualTfContext, channelAtTime, structureIndexAt, type KuriskoDualTfContext } from "./dual-tf-context";
import {
  aboveOrInsideLowerRail,
  flagpoleOffEma20,
  k2EntryHook,
  K2_STOCH_A_ENTRY_MAX,
  nearEma20,
  pullbackHoldsEma20,
  quadDipToward20,
  strongUpLegStruct,
  structureEmbeddedBull,
} from "./k2-k3-helpers";

export type { KuriskoCriterionStep };

export interface K2DiagnoseOpts {
  embedBarsStruct?: number;
  touchPct?: number;
}

export interface K2FunnelStats {
  bars: number;
  upChannelOrUpLeg: number;
  embeddedBull5m: number;
  flagpole: number;
  pullbackQuadDip: number;
  entryHook: number;
  allPass: number;
}

export interface K2BestMatch {
  barIndex: number;
  ts: number;
  passCount: number;
  totalSteps: number;
  steps: KuriskoCriterionStep[];
  allPass: boolean;
}

const K2_CORE_IDS = new Set([
  "k2_e1_up_env",
  "k2_e2_embedded_bull",
  "k2_e3_flagpole",
  "k2_e4_pullback",
  "k2_entry_hook",
  "k2_holds_ema20",
  "k2_no_breakdown",
]);

export function evaluateK2LongSteps(
  candlesExec: LighterCandle[],
  ctx: KuriskoDualTfContext,
  i: number,
  opts: K2DiagnoseOpts = {}
): KuriskoCriterionStep[] {
  const embedBars = opts.embedBarsStruct ?? KURISKO_DEFAULT_EMBED_BARS_5M;
  const c = candlesExec[i]!;
  const idxStruct = structureIndexAt(ctx, c.t);
  const channel = channelAtTime(ctx, c.t);
  const steps: KuriskoCriterionStep[] = [];

  const chUp = channelValidUp(channel);
  const ema20s = idxStruct >= 0 ? (ctx.ema20Struct[idxStruct] ?? 0) : 0;
  const upLeg =
    idxStruct >= 0 && strongUpLegStruct(c.c, ema20s, ctx.ema20Struct, idxStruct);
  const e1 = chUp || upLeg;
  steps.push({
    id: "k2_e1_up_env",
    label: "K2_E1 — Up-channel OR strong up-leg (price > 5m EMA_20 rising)",
    pass: e1,
    detail: chUp
      ? `Valid ascending channel (${channel.slopeDeg?.toFixed(1) ?? "?"}°)`
      : upLeg
        ? `Up-leg: price ${c.c.toFixed(2)} > 5m EMA_20 ${ema20s.toFixed(2)} rising`
        : `No up-channel; price vs 5m EMA_20 ${ema20s.toFixed(2)} (need price above + rising)`,
  });

  const embed = structureEmbeddedBull(ctx.stackStruct, idxStruct, embedBars);
  const dNow = idxStruct >= 0 ? (ctx.stackStruct.D[idxStruct] ?? 0) : 0;
  steps.push({
    id: "k2_e2_embedded_bull",
    label: `K2_E2 — EMBEDDED_BULL(5m): STOCH_D(60,10) ≥ 80 for ${embedBars} bars`,
    pass: embed,
    detail: embed
      ? `STOCH_D(5m)=${dNow.toFixed(1)} pinned ≥80 ×${embedBars}`
      : `STOCH_D(5m)=${dNow.toFixed(1)} — need ≥80 for ${embedBars} consecutive structure bars`,
  });

  const pole = flagpoleOffEma20(candlesExec, ctx.ema20, i);
  steps.push({
    id: "k2_e3_flagpole",
    label: "K2_E3 — Flagpole (≥2 green 1m bars steep rally off EMA_20)",
    pass: pole.ok,
    detail: pole.detail,
  });

  const ema20 = ctx.ema20[i] ?? c.c;
  const near20 = nearEma20(c, ema20);
  const dip = quadDipToward20(ctx.stackExec, i);
  const e4 = near20 && dip.ok && embed;
  steps.push({
    id: "k2_e4_pullback",
    label: "K2_E4 — Pullback to 1m EMA_20 + quad dip (A toward 20) while 5m embedded",
    pass: e4,
    detail: e4
      ? `Near EMA_20 ${ema20.toFixed(2)}; ${dip.detail}`
      : `nearEMA20=${near20}; embed=${embed}; ${dip.detail}`,
  });

  const hook = k2EntryHook(ctx.stackExec, i);
  const a = ctx.stackExec.A[i] ?? 0;
  const prevA = ctx.stackExec.A[i - 1] ?? 0;
  steps.push({
    id: "k2_entry_hook",
    label: `Trigger — STOCH_A(9,3) ≤ ${K2_STOCH_A_ENTRY_MAX} and hooks up`,
    pass: hook,
    detail: hook
      ? `STOCH_A ${prevA.toFixed(1)} → ${a.toFixed(1)}`
      : `STOCH_A ${prevA.toFixed(1)} → ${a.toFixed(1)} (need hook from ≤${K2_STOCH_A_ENTRY_MAX})`,
  });

  const holds = pullbackHoldsEma20(c, ema20);
  steps.push({
    id: "k2_holds_ema20",
    label: `Entry filter — low ≥ EMA_20 × (1 − ${KURISKO_DEFAULT_STOP_BUFFER_PCT})`,
    pass: holds,
    detail: holds
      ? `Low ${c.l.toFixed(2)} holds EMA_20 ${ema20.toFixed(2)}`
      : `Low ${c.l.toFixed(2)} broke EMA_20 ${ema20.toFixed(2)} buffer`,
  });

  const noBreak = aboveOrInsideLowerRail(c, channel);
  const lower = channel.valid ? channel.lowerAt(c.t) : 0;
  steps.push({
    id: "k2_no_breakdown",
    label: "Entry filter — price inside/above 5m lower rail (no channel break down)",
    pass: noBreak,
    detail: channel.valid
      ? noBreak
        ? `Low ${c.l.toFixed(2)} ≥ lower ${lower.toFixed(2)}`
        : `Low ${c.l.toFixed(2)} broke lower rail ${lower.toFixed(2)}`
      : "No locked channel — rail break skipped (up-leg path)",
  });

  return steps;
}

export function stepsSummaryK2(steps: KuriskoCriterionStep[]): { passCount: number; allPass: boolean } {
  return {
    passCount: countPassingSteps(steps, K2_CORE_IDS),
    allPass: allStepsPass(steps, K2_CORE_IDS),
  };
}

export function evaluateK2AtBar(
  candlesExec: LighterCandle[],
  ctx: KuriskoDualTfContext,
  i: number,
  opts: K2DiagnoseOpts = {}
): { steps: KuriskoCriterionStep[]; passCount: number; allPass: boolean } {
  const steps = evaluateK2LongSteps(candlesExec, ctx, i, opts);
  return { steps, ...stepsSummaryK2(steps) };
}

export function diagnoseK2Funnel(
  candlesExec: LighterCandle[],
  structurePeriodMs: number,
  opts: K2DiagnoseOpts = {}
): K2FunnelStats {
  const ctx = buildDualTfContext(candlesExec, structurePeriodMs);
  const stats: K2FunnelStats = {
    bars: candlesExec.length,
    upChannelOrUpLeg: 0,
    embeddedBull5m: 0,
    flagpole: 0,
    pullbackQuadDip: 0,
    entryHook: 0,
    allPass: 0,
  };

  for (let i = 80; i < candlesExec.length; i++) {
    const steps = evaluateK2LongSteps(candlesExec, ctx, i, opts);
    const byId = Object.fromEntries(steps.map((s) => [s.id, s.pass]));
    if (byId.k2_e1_up_env) {
      stats.upChannelOrUpLeg++;
      if (byId.k2_e2_embedded_bull) {
        stats.embeddedBull5m++;
        if (byId.k2_e3_flagpole) {
          stats.flagpole++;
          if (byId.k2_e4_pullback) {
            stats.pullbackQuadDip++;
            if (byId.k2_entry_hook) {
              stats.entryHook++;
              if (stepsSummaryK2(steps).allPass) stats.allPass++;
            }
          }
        }
      }
    }
  }
  return stats;
}

export function diagnoseK2BestMatch(
  candlesExec: LighterCandle[],
  structurePeriodMs: number,
  opts: K2DiagnoseOpts = {}
): K2BestMatch | null {
  const ctx = buildDualTfContext(candlesExec, structurePeriodMs);
  let best: K2BestMatch | null = null;
  for (let i = 80; i < candlesExec.length; i++) {
    const { steps, passCount, allPass } = evaluateK2AtBar(candlesExec, ctx, i, opts);
    if (
      !best ||
      passCount > best.passCount ||
      (passCount === best.passCount && i > best.barIndex)
    ) {
      best = {
        barIndex: i,
        ts: candlesExec[i]!.t,
        passCount,
        totalSteps: steps.length,
        steps,
        allPass,
      };
    }
  }
  return best;
}

export function diagnoseK2LatestBar(
  candlesExec: LighterCandle[],
  structurePeriodMs: number,
  opts: K2DiagnoseOpts = {}
): { steps: KuriskoCriterionStep[]; passCount: number; allPass: boolean } {
  if (candlesExec.length < 81) {
    const warmup: KuriskoCriterionStep = {
      id: "warmup",
      label: "Enough history",
      pass: false,
      detail: `Need 80+ execution bars (have ${candlesExec.length})`,
    };
    return { steps: [warmup], passCount: 0, allPass: false };
  }
  const ctx = buildDualTfContext(candlesExec, structurePeriodMs);
  return evaluateK2AtBar(candlesExec, ctx, candlesExec.length - 1, opts);
}

export function diagnoseK2(
  candlesExec: LighterCandle[],
  structurePeriodMs: number,
  opts: K2DiagnoseOpts = {}
) {
  return {
    funnel: diagnoseK2Funnel(candlesExec, structurePeriodMs, opts),
    bestMatch: diagnoseK2BestMatch(candlesExec, structurePeriodMs, opts),
    latestBar: diagnoseK2LatestBar(candlesExec, structurePeriodMs, opts),
  };
}
