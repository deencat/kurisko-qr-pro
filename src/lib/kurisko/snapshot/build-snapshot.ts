import "server-only";

import { loadAzizMarketData } from "@/lib/aziz/improvement/market-data";
import { diagnoseK1LatestBar } from "@/lib/kurisko/backtest/k1-diagnose";
import { diagnoseK2LatestBar } from "@/lib/kurisko/backtest/k2-diagnose";
import { diagnoseK3LatestBar } from "@/lib/kurisko/backtest/k3-diagnose";
import { buildDualTfContext, channelAtTime, structureIndexAt } from "@/lib/kurisko/backtest/dual-tf-context";
import { channelValidK1 } from "@/lib/kurisko/indicators/channel-geometry";
import { episodesForChart } from "@/lib/kurisko/indicators/channel-episodes";
import { KURISKO_STOCH_PARAMS, KURISKO_STOCH_THRESH_OVERBOUGHT } from "@/lib/kurisko/constants";
import {
  getKuriskoTimeframePair,
  kuriskoStructurePeriodMs,
} from "@/lib/kurisko/timeframes";
import { resolveK1Stage } from "./k1-stage";
import { resolveK2Stage, resolveK3Stage } from "./k2-k3-stage";
import { computeQuadDepths } from "./quad-depth";
import { computeVortexFlux } from "./vortex-flux";
import type { KuriskoChartCandle, KuriskoQuadValues, KuriskoSnapshot } from "./types";

const SNAPSHOT_LOOKBACK_DAYS = 2;
const CHART_BAR_COUNT = 90;

function quadAt(stack: Record<"A" | "B" | "C" | "D", number[]>, i: number): KuriskoQuadValues {
  return {
    A: stack.A[i] ?? 0,
    B: stack.B[i] ?? 0,
    C: stack.C[i] ?? 0,
    D: stack.D[i] ?? 0,
  };
}

export interface BuildKuriskoSnapshotParams {
  symbol: string;
  timeframePairId?: string;
}

export async function buildKuriskoSnapshot(params: BuildKuriskoSnapshotParams): Promise<KuriskoSnapshot> {
  const symbol = params.symbol.toUpperCase();
  const timeframePair = getKuriskoTimeframePair(params.timeframePairId);
  const structurePeriodMs = kuriskoStructurePeriodMs(timeframePair);

  const marketData = await loadAzizMarketData({
    symbol,
    resolution: timeframePair.execution,
    days: SNAPSHOT_LOOKBACK_DAYS,
    dataSource: "capital",
  });

  const candles = marketData.candles;
  if (candles.length < 81) {
    throw new Error(
      `Insufficient ${timeframePair.execution} data for ${symbol} (${candles.length} bars). Capital may not list this symbol.`
    );
  }

  const latest = diagnoseK1LatestBar(candles, structurePeriodMs);
  const k2Latest = diagnoseK2LatestBar(candles, structurePeriodMs);
  const k3Latest = diagnoseK3LatestBar(candles, structurePeriodMs);
  const ctx = buildDualTfContext(candles, structurePeriodMs);
  const i = candles.length - 1;
  const bar = candles[i]!;
  const channel = channelAtTime(ctx, bar.t);
  const structIdx = Math.max(0, structureIndexAt(ctx, bar.t));

  const side = latest.preferredSide;
  const steps = side === "short" ? latest.shortSteps : latest.longSteps;
  const quadExec = quadAt(ctx.stackExec, i);
  const quadStruct = quadAt(ctx.stackStruct, structIdx);
  const depthExec = computeQuadDepths(quadExec, side);
  const depthStruct = computeQuadDepths(quadStruct, side);
  const stage = resolveK1Stage(steps, side, depthStruct);
  const passCount = steps.filter((s) => s.pass).length;
  const vortexFlux = computeVortexFlux(quadStruct, depthStruct, side);

  const ema50 = ctx.ema50[i] ?? bar.c;
  const ema200 = ctx.ema200[i] ?? bar.c;
  const sessionVwap = ctx.sessionVwap[i] ?? bar.c;
  const marketContext = {
    sessionVwap,
    ema50,
    ema200,
    aboveVwap: bar.c >= sessionVwap,
    aboveEma50: bar.c >= ema50,
    aboveEma200: bar.c >= ema200,
    stoch6010: quadExec.D,
    stoch6010Depth: depthExec.bars.find((b) => b.key === "D")?.depth ?? 0,
  };

  const chartStart = Math.max(0, candles.length - CHART_BAR_COUNT);
  const chartBars: KuriskoChartCandle[] = candles.slice(chartStart).map((c) => ({
    t: c.t,
    o: c.o,
    h: c.h,
    l: c.l,
    c: c.c,
  }));

  const chartTStart = chartBars[0]?.t ?? bar.t;
  const chartTEnd = bar.t + structurePeriodMs;
  const channelEpisodes = episodesForChart(
    ctx.channelEpisodes,
    chartTStart,
    chartTEnd,
    bar.t,
    12,
    bar.c
  );

  // Align UI "channelValid" with K1_E1 slope gate (not raw episode lock).
  const channelOk = channelValidK1(channel);
  const keyLevels = channelOk
    ? {
        upper: channel.upperAt(bar.t),
        mid: channel.midAt(bar.t),
        lower: channel.lowerAt(bar.t),
        slopeDeg: channel.slopeDeg ?? null,
      }
    : null;

  const k2Stage = resolveK2Stage(k2Latest.steps, k2Latest.allPass);
  const k3Stage = resolveK3Stage(k3Latest.steps, k3Latest.allPass);
  const stochA = quadExec.A;
  const k2Env =
    (k2Latest.steps.find((s) => s.id === "k2_e1_up_env")?.pass ?? false) &&
    (k2Latest.steps.find((s) => s.id === "k2_e2_embedded_bull")?.pass ?? false);

  return {
    symbol,
    dataSource: "capital",
    timeframePairId: timeframePair.id,
    executionResolution: timeframePair.execution,
    structureResolution: timeframePair.structure,
    barTs: bar.t,
    price: bar.c,
    channelDirection: channelOk ? channel.direction : "none",
    channelValid: channelOk,
    keyLevels,
    channelEpisodes,
    chartBars,
    vortexFlux,
    marketContext,
    side,
    stage,
    passCount,
    totalSteps: steps.length,
    quadExec,
    quadStruct,
    depthExec,
    depthStruct,
    steps,
    k2: {
      strategy: "k2_stoch_bull_flag",
      side: "long",
      stage: k2Stage,
      passCount: k2Latest.passCount,
      totalSteps: k2Latest.steps.length,
      allPass: k2Latest.allPass,
      steps: k2Latest.steps,
    },
    k3: {
      strategy: "k3_bear_flag",
      side: "short",
      stage: k3Stage,
      passCount: k3Latest.passCount,
      totalSteps: k3Latest.steps.length,
      allPass: k3Latest.allPass,
      steps: k3Latest.steps,
      mandatoryLongExit: k3Latest.mandatoryLongExit,
    },
    exitsVisual: {
      k2StochAExit: k2Env && stochA >= KURISKO_STOCH_THRESH_OVERBOUGHT,
      k3MandatoryLongExit: k3Latest.mandatoryLongExit,
      k3SellStrength: k3Latest.allPass,
      stochA,
    },
    scannedAt: Date.now(),
  };
}

export const KURISKO_DEFAULT_SCAN_SYMBOLS = ["US500", "US100", "GOLD", "BTCUSD", "US30"] as const;

export function kuriskoQuadLabel(): string {
  return KURISKO_STOCH_PARAMS.map(({ period, smooth }) => `${period},${smooth}`).join(" · ");
}
