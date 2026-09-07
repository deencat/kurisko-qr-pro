/**
 * K1 event backtest CLI — research smoke (no live trading).
 *
 * Examples:
 *   npm run k1:backtest -- --symbol US500 --days 3
 *   npm run k1:backtest -- --symbol GOLD --from 2026-09-01 --to 2026-09-03
 *   npm run k1:backtest -- --fixture  # offline synthetic candles
 */
import fs from "node:fs";
import path from "node:path";
import { loadCapitalEnv } from "./load-env";
import { fetchCapital1mRange, isCapitalConfigured } from "./capital-fetch";
import { runK1EventBacktest } from "../../src/lib/kurisko/backtest/k1-event-engine";
import { diagnoseK1Funnel } from "../../src/lib/kurisko/backtest/k1-diagnose";
import type { LighterCandle } from "../../src/lib/lighter/client";

loadCapitalEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

function dayMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}

/** Minimal synthetic series so smoke works offline (not a realistic K1 tape). */
function syntheticCandles(n = 400): LighterCandle[] {
  const out: LighterCandle[] = [];
  const start = Date.UTC(2026, 8, 1, 13, 0, 0);
  let px = 5000;
  for (let i = 0; i < n; i++) {
    const drift = Math.sin(i / 17) * 2 + (i % 40 === 0 ? -8 : 0.05);
    const o = px;
    const c = px + drift;
    const h = Math.max(o, c) + 1.2;
    const l = Math.min(o, c) - 1.2;
    out.push({ t: start + i * 60_000, o, h, l, c, v: 100 + (i % 7) });
    px = c;
  }
  return out;
}

async function main() {
  const symbol = (arg("--symbol") ?? "US500").toUpperCase();
  const useFixture = has("--fixture");
  const days = Number(arg("--days") ?? "2");
  const toArg = arg("--to");
  const fromArg = arg("--from");
  const endTs = toArg ? Date.parse(toArg) : Date.now();
  const startTs = fromArg ? Date.parse(fromArg) : endTs - dayMs(Number.isFinite(days) ? days : 2);

  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs) {
    throw new Error("Invalid --from/--to/--days range");
  }

  let candles: LighterCandle[];
  let source: string;

  if (useFixture) {
    candles = syntheticCandles(500);
    source = "fixture:synthetic";
  } else if (!isCapitalConfigured()) {
    console.warn(
      "Capital credentials missing — falling back to --fixture. Set CAPITAL_API_KEY / CAPITAL_IDENTIFIER / CAPITAL_API_PASSWORD (or CAPITAL_PASSWORD)."
    );
    candles = syntheticCandles(500);
    source = "fixture:synthetic (no capital env)";
  } else {
    console.log(`Fetching Capital 1m ${symbol} ${new Date(startTs).toISOString()} → ${new Date(endTs).toISOString()}`);
    const fetched = await fetchCapital1mRange({
      symbol,
      startTimestamp: startTs,
      endTimestamp: endTs,
      onProgress: (m) => console.log(m),
    });
    candles = fetched.candles;
    source = `capital:${fetched.epic} (${fetched.volumeMode} volume)`;
  }

  console.log(`Bars: ${candles.length} · source=${source}`);

  if (candles.length < 150) {
    console.warn("Short history — expect few/no SIGNAL entries (need warmup + structure).");
  }

  const funnel = diagnoseK1Funnel(candles, 5 * 60_000);
  const result = runK1EventBacktest(candles, {
    symbol: useFixture ? "SYNTH" : symbol,
    structurePeriodMs: 5 * 60_000,
    timeStopBars: 20,
    equity: 10_000,
    riskPct: 2,
  });

  const s = result.summary;
  console.log("\n=== K1 event backtest summary ===");
  console.log(
    JSON.stringify(
      {
        source,
        symbol: s.symbol,
        bars: s.bars,
        signals: s.signals,
        trades: s.trades,
        wins: s.wins,
        losses: s.losses,
        winRate: Number((s.winRate * 100).toFixed(1)),
        profitFactor:
          s.profitFactor == null
            ? null
            : !Number.isFinite(s.profitFactor)
              ? "Inf"
              : Number(s.profitFactor.toFixed(3)),
        netPnl: Number(s.netPnl.toFixed(2)),
        grossPnl: Number(s.grossPnl.toFixed(2)),
        costs: Number(s.costs.toFixed(2)),
        expectancy: Number(s.expectancy.toFixed(2)),
        maxDrawdown: Number(s.maxDrawdown.toFixed(2)),
        byExitReason: s.byExitReason,
        funnelSnippet: {
          channelValidDown: funnel.channelValidDown,
          atLowerRail: funnel.atLowerRail,
          execQuadOs: funnel.execQuadOs,
          bullishDiv: funnel.bullishDiv,
          longSizingOk: funnel.longSizingOk,
          channelValidUp: funnel.channelValidUp,
          shortSizingOk: funnel.shortSizingOk,
        },
      },
      null,
      2
    )
  );

  if (result.trades.length) {
    console.log("\n=== Trades (first 20) ===");
    for (const t of result.trades.slice(0, 20)) {
      console.log(
        `#${t.id} ${t.side} entry=${t.entryPrice.toFixed(2)} exit=${t.exitPrice.toFixed(2)} ` +
          `net=${t.netPnl.toFixed(2)} reason=${t.exitReason} bars=${t.barsHeld}`
      );
    }
  }

  const outDir = path.join(process.cwd(), "data", "kurisko", "runs");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `k1-${s.symbol}-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ source, summary: s, trades: result.trades, funnel }, null, 2));
  console.log("\nWrote", outPath);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
