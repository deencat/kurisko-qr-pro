import "server-only";

import { loadAzizMarketData } from "@/lib/aziz/improvement/market-data";
import { diagnoseK1LatestBar } from "@/lib/kurisko/backtest/k1-diagnose";
import { buildDualTfContext, channelAtTime, structureIndexAt } from "@/lib/kurisko/backtest/dual-tf-context";
import { aggregateCandles } from "@/lib/kurisko/indicators/channel-geometry";
import { buildQuadStochStack } from "@/lib/kurisko/indicators/stochastic-quad";
import { KURISKO_STOCH_PARAMS } from "@/lib/kurisko/constants";
import {
  getKuriskoTimeframePair,
  kuriskoStructurePeriodMs,
} from "@/lib/kurisko/timeframes";
import { resolveK1Stage } from "./k1-stage";
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

  const keyLevels = channel.valid
    ? {
        upper: channel.upperAt(bar.t),
        mid: channel.midAt(bar.t),
        lower: channel.lowerAt(bar.t),
        slopeDeg: channel.slopeDeg ?? null,
      }
    : null;

  return {
    symbol,
    dataSource: "capital",
    timeframePairId: timeframePair.id,
    executionResolution: timeframePair.execution,
    structureResolution: timeframePair.structure,
    barTs: bar.t,
    price: bar.c,
    channelDirection: channel.direction,
    channelValid: channel.valid,
    keyLevels,
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
    scannedAt: Date.now(),
  };
}

export const KURISKO_DEFAULT_SCAN_SYMBOLS = ["US500", "US100", "GOLD", "BTCUSD", "US30"] as const;

export function kuriskoQuadLabel(): string {
  return KURISKO_STOCH_PARAMS.map(({ period, smooth }) => `${period},${smooth}`).join(" · ");
}
