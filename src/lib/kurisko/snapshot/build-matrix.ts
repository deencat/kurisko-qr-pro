import "server-only";

import { loadAzizMarketData } from "@/lib/aziz/improvement/market-data";
import type { LighterCandle } from "@/lib/lighter/client";
import { diagnoseK1LatestBar } from "@/lib/kurisko/backtest/k1-diagnose";
import { aggregateCandles } from "@/lib/kurisko/indicators/channel-geometry";
import { buildQuadStochStack } from "@/lib/kurisko/indicators/stochastic-quad";
import { resolveK1Stage } from "./k1-stage";
import { computeQuadDepths } from "./quad-depth";
import type { KuriskoMatrix, KuriskoMatrixRow, KuriskoQuadValues } from "./types";

const LOOKBACK_DAYS = 2;

const MATRIX_TIMEFRAMES: { timeframe: "1m" | "3m" | "5m"; periodMs: number }[] = [
  { timeframe: "1m", periodMs: 60_000 },
  { timeframe: "3m", periodMs: 3 * 60_000 },
  { timeframe: "5m", periodMs: 5 * 60_000 },
];

function quadAt(stack: Record<"A" | "B" | "C" | "D", number[]>, i: number): KuriskoQuadValues {
  return {
    A: stack.A[i] ?? 0,
    B: stack.B[i] ?? 0,
    C: stack.C[i] ?? 0,
    D: stack.D[i] ?? 0,
  };
}

function candlesForTf(candles1m: LighterCandle[], periodMs: number): LighterCandle[] {
  if (periodMs === 60_000) return candles1m;
  return aggregateCandles(candles1m, periodMs);
}

function matrixBias(side: "long" | "short"): "BULL" | "BEAR" | "NEUTRAL" {
  if (side === "long") return "BULL";
  if (side === "short") return "BEAR";
  return "NEUTRAL";
}

export async function buildKuriskoMatrix(symbol: string): Promise<KuriskoMatrix> {
  const sym = symbol.toUpperCase();
  const marketData = await loadAzizMarketData({
    symbol: sym,
    resolution: "1m",
    days: LOOKBACK_DAYS,
    dataSource: "capital",
  });

  const candles1m = marketData.candles;
  if (candles1m.length < 81) {
    throw new Error(`Insufficient 1m data for ${sym} (${candles1m.length} bars)`);
  }

  const rows: KuriskoMatrixRow[] = [];

  for (const { timeframe, periodMs } of MATRIX_TIMEFRAMES) {
    const candles = candlesForTf(candles1m, periodMs);
    if (candles.length < 40) continue;

    const stack = buildQuadStochStack(candles);
    const i = candles.length - 1;
    const quad = quadAt(stack, i);
    const bar = candles[i]!;

    const latest = diagnoseK1LatestBar(candles, periodMs);
    const side = latest.preferredSide;
    const steps = side === "short" ? latest.shortSteps : latest.longSteps;
    const depths = computeQuadDepths(quad, side);
    const stage = resolveK1Stage(steps, side, depths);

    rows.push({
      timeframe,
      side,
      stage,
      bias: matrixBias(side),
      quad,
      depths,
      barTs: bar.t,
      price: bar.c,
    });
  }

  return {
    symbol: sym,
    dataSource: "capital",
    rows,
    scannedAt: Date.now(),
  };
}
