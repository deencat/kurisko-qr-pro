/**
 * K3 — Bear Flag / Sell-Strength diagnose engine (RAG STRATEGY K3).
 * Short (or exit longs): 5m EMBEDDED_BEAR (60,10) + 1m dead-cat / 9,3 surge to 80.
 */
import type { LighterCandle } from "@/lib/lighter/client";
import {
  KURISKO_DEFAULT_CHANNEL_TOUCH_PCT,
  KURISKO_DEFAULT_EMBED_BARS_5M,
  KURISKO_STOCH_THRESH_OVERBOUGHT,
} from "../constants";
import { channelValidDown, upperRailContextOk } from "../indicators/channel-geometry";
import { allStepsPass, countPassingSteps, type KuriskoCriterionStep } from "./criterion-step";
import { buildDualTfContext, channelAtTime, structureIndexAt, type KuriskoDualTfContext } from "./dual-tf-context";
import {
  belowExecEma20And50,
  belowStructEma200,
  deadCatBounceToResistance,
  k3MandatoryLongExit,
  k3SellStrengthCross,
  K3_STOCH_A_SELL_MIN,
  stochSurgeToward80,
  structureEmbeddedBear,
} from "./k2-k3-helpers";

export type { KuriskoCriterionStep };

export interface K3DiagnoseOpts {
  embedBarsStruct?: number;
  touchPct?: number;
}

export interface K3FunnelStats {
  bars: number;
  downChannelOrWeak: number;
  embeddedBear5m: number;
  deadCatBounce: number;
  surgeToward80: number;
  sellStrengthCross: number;
  allPass: number;
  /** Bars where K3 macro + A≥80 → mandatory long exit. */
  mandatoryLongExit: number;
}

export interface K3BestMatch {
  barIndex: number;
  ts: number;
  passCount: number;
  totalSteps: number;
  steps: KuriskoCriterionStep[];
  allPass: boolean;
}

const K3_CORE_IDS = new Set([
  "k3_e1_weak_env",
  "k3_e2_embedded_bear",
  "k3_e3_dead_cat",
  "k3_e4_surge",
  "k3_sell_cross",
  "k3_below_emas",
]);

export function evaluateK3ShortSteps(
  candlesExec: LighterCandle[],
  ctx: KuriskoDualTfContext,
  i: number,
  opts: K3DiagnoseOpts = {}
): KuriskoCriterionStep[] {
  const embedBars = opts.embedBarsStruct ?? KURISKO_DEFAULT_EMBED_BARS_5M;
  const touchPct = opts.touchPct ?? KURISKO_DEFAULT_CHANNEL_TOUCH_PCT;
  const c = candlesExec[i]!;
  const idxStruct = structureIndexAt(ctx, c.t);
  const channel = channelAtTime(ctx, c.t);
  const steps: KuriskoCriterionStep[] = [];

  const chDown = channelValidDown(channel);
  const ema200s = idxStruct >= 0 ? (ctx.ema200Struct[idxStruct] ?? 0) : 0;
  const weak = belowStructEma200(c.c, ema200s);
  const e1 = chDown || weak;
  steps.push({
    id: "k3_e1_weak_env",
    label: "K3_E1 — Down-channel OR price < 5m EMA_200",
    pass: e1,
    detail: chDown
      ? `Valid descending channel (${channel.slopeDeg?.toFixed(1) ?? "?"}°)`
      : weak
        ? `Price ${c.c.toFixed(2)} < 5m EMA_200 ${ema200s.toFixed(2)}`
        : `No down-channel; price ${c.c.toFixed(2)} vs EMA_200 ${ema200s.toFixed(2)}`,
  });

  const embed = structureEmbeddedBear(ctx.stackStruct, idxStruct, embedBars);
  const dNow = idxStruct >= 0 ? (ctx.stackStruct.D[idxStruct] ?? 100) : 100;
  steps.push({
    id: "k3_e2_embedded_bear",
    label: `K3_E2 — EMBEDDED_BEAR(5m): STOCH_D(60,10) ≤ 20 for ${embedBars} bars`,
    pass: embed,
    detail: embed
      ? `STOCH_D(5m)=${dNow.toFixed(1)} pinned ≤20 ×${embedBars}`
      : `STOCH_D(5m)=${dNow.toFixed(1)} — need ≤20 for ${embedBars} consecutive structure bars`,
  });

  const bounce = deadCatBounceToResistance(candlesExec, ctx.stackExec, channel, i, 10, touchPct);
  const atUpper = upperRailContextOk(candlesExec, i, channel, touchPct);
  const mid = channel.valid ? channel.midAt(c.t) : 0;
  const nearMid = mid > 0 && Math.abs(c.c - mid) / c.c <= touchPct * 3;
  const e3 = bounce.ok || atUpper || nearMid;
  steps.push({
    id: "k3_e3_dead_cat",
    label: "K3_E3 — Dead-cat bounce to upper rail or mid-channel",
    pass: e3,
    detail: e3
      ? `${bounce.detail}${atUpper ? " · AT_UPPER_RAIL" : ""}${nearMid ? " · near mid" : ""}`
      : bounce.detail,
  });

  const surge = stochSurgeToward80(ctx.stackExec, i);
  const a = ctx.stackExec.A[i] ?? 0;
  const prevA = ctx.stackExec.A[i - 1] ?? 0;
  steps.push({
    id: "k3_e4_surge",
    label: "K3_E4 — STOCH_A(9,3) surges toward 80 (sell-strength rotation)",
    pass: surge,
    detail: surge
      ? `STOCH_A ${prevA.toFixed(1)} → ${a.toFixed(1)}`
      : `STOCH_A ${prevA.toFixed(1)} → ${a.toFixed(1)} (need rising into ≥70)`,
  });

  const cross = k3SellStrengthCross(ctx.stackExec, i);
  steps.push({
    id: "k3_sell_cross",
    label: `Trigger — STOCH_A crosses ${K3_STOCH_A_SELL_MIN}–80 (sell strength)`,
    pass: cross,
    detail: cross
      ? `Cross ${prevA.toFixed(1)} → ${a.toFixed(1)}`
      : `No cross through ${K3_STOCH_A_SELL_MIN} (now ${a.toFixed(1)})`,
  });

  const ema20 = ctx.ema20[i] ?? c.c;
  const ema50 = ctx.ema50[i] ?? c.c;
  const below = belowExecEma20And50(c.c, ema20, ema50);
  steps.push({
    id: "k3_below_emas",
    label: "Entry filter — price below 1m EMA_20 and EMA_50",
    pass: below,
    detail: below
      ? `Price ${c.c.toFixed(2)} < EMA_20 ${ema20.toFixed(2)} & EMA_50 ${ema50.toFixed(2)}`
      : `Price ${c.c.toFixed(2)} vs EMA_20 ${ema20.toFixed(2)} / EMA_50 ${ema50.toFixed(2)}`,
  });

  const macro = e1 && embed;
  const mandExit = k3MandatoryLongExit(a, macro);
  steps.push({
    id: "k3_mandatory_long_exit",
    label: `Exit visual — K3 macro + STOCH_A ≥ ${KURISKO_STOCH_THRESH_OVERBOUGHT} → mandatory long exit`,
    pass: mandExit,
    detail: mandExit
      ? `MANDATORY_EXIT longs — A=${a.toFixed(1)} under embedded bear / weak tape`
      : macro
        ? `K3 macro on but A=${a.toFixed(1)} < ${KURISKO_STOCH_THRESH_OVERBOUGHT}`
        : "K3 macro inactive — no mandatory long exit",
  });

  return steps;
}

export function stepsSummaryK3(steps: KuriskoCriterionStep[]): { passCount: number; allPass: boolean } {
  return {
    passCount: countPassingSteps(steps, K3_CORE_IDS),
    allPass: allStepsPass(steps, K3_CORE_IDS),
  };
}

/** Macro env only (E1+E2) — used for long-exit overlay without requiring short SIGNAL. */
export function k3MacroActive(steps: KuriskoCriterionStep[]): boolean {
  return (
    (steps.find((s) => s.id === "k3_e1_weak_env")?.pass ?? false) &&
    (steps.find((s) => s.id === "k3_e2_embedded_bear")?.pass ?? false)
  );
}

export function evaluateK3AtBar(
  candlesExec: LighterCandle[],
  ctx: KuriskoDualTfContext,
  i: number,
  opts: K3DiagnoseOpts = {}
): { steps: KuriskoCriterionStep[]; passCount: number; allPass: boolean; mandatoryLongExit: boolean } {
  const steps = evaluateK3ShortSteps(candlesExec, ctx, i, opts);
  const { passCount, allPass } = stepsSummaryK3(steps);
  const mandatoryLongExit = steps.find((s) => s.id === "k3_mandatory_long_exit")?.pass ?? false;
  return { steps, passCount, allPass, mandatoryLongExit };
}

export function diagnoseK3Funnel(
  candlesExec: LighterCandle[],
  structurePeriodMs: number,
  opts: K3DiagnoseOpts = {}
): K3FunnelStats {
  const ctx = buildDualTfContext(candlesExec, structurePeriodMs);
  const stats: K3FunnelStats = {
    bars: candlesExec.length,
    downChannelOrWeak: 0,
    embeddedBear5m: 0,
    deadCatBounce: 0,
    surgeToward80: 0,
    sellStrengthCross: 0,
    allPass: 0,
    mandatoryLongExit: 0,
  };

  for (let i = 80; i < candlesExec.length; i++) {
    const { steps, allPass, mandatoryLongExit } = evaluateK3AtBar(candlesExec, ctx, i, opts);
    const byId = Object.fromEntries(steps.map((s) => [s.id, s.pass]));
    if (mandatoryLongExit) stats.mandatoryLongExit++;
    if (byId.k3_e1_weak_env) {
      stats.downChannelOrWeak++;
      if (byId.k3_e2_embedded_bear) {
        stats.embeddedBear5m++;
        if (byId.k3_e3_dead_cat) {
          stats.deadCatBounce++;
          if (byId.k3_e4_surge) {
            stats.surgeToward80++;
            if (byId.k3_sell_cross) {
              stats.sellStrengthCross++;
              if (allPass) stats.allPass++;
            }
          }
        }
      }
    }
  }
  return stats;
}

export function diagnoseK3BestMatch(
  candlesExec: LighterCandle[],
  structurePeriodMs: number,
  opts: K3DiagnoseOpts = {}
): K3BestMatch | null {
  const ctx = buildDualTfContext(candlesExec, structurePeriodMs);
  let best: K3BestMatch | null = null;
  for (let i = 80; i < candlesExec.length; i++) {
    const { steps, passCount, allPass } = evaluateK3AtBar(candlesExec, ctx, i, opts);
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

export function diagnoseK3LatestBar(
  candlesExec: LighterCandle[],
  structurePeriodMs: number,
  opts: K3DiagnoseOpts = {}
): {
  steps: KuriskoCriterionStep[];
  passCount: number;
  allPass: boolean;
  mandatoryLongExit: boolean;
} {
  if (candlesExec.length < 81) {
    const warmup: KuriskoCriterionStep = {
      id: "warmup",
      label: "Enough history",
      pass: false,
      detail: `Need 80+ execution bars (have ${candlesExec.length})`,
    };
    return { steps: [warmup], passCount: 0, allPass: false, mandatoryLongExit: false };
  }
  const ctx = buildDualTfContext(candlesExec, structurePeriodMs);
  return evaluateK3AtBar(candlesExec, ctx, candlesExec.length - 1, opts);
}

export function diagnoseK3(
  candlesExec: LighterCandle[],
  structurePeriodMs: number,
  opts: K3DiagnoseOpts = {}
) {
  return {
    funnel: diagnoseK3Funnel(candlesExec, structurePeriodMs, opts),
    bestMatch: diagnoseK3BestMatch(candlesExec, structurePeriodMs, opts),
    latestBar: diagnoseK3LatestBar(candlesExec, structurePeriodMs, opts),
  };
}
