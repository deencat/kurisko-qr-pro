/**
 * K2/K3 diagnose funnel CLI — research smoke (no live trading).
 *
 * Usage:
 *   npx tsx --import ./scripts/kurisko/stub-server-only.mjs scripts/kurisko/k2-k3-diagnose-run.ts --fixture
 *   npx tsx --import ./scripts/kurisko/stub-server-only.mjs scripts/kurisko/k2-k3-diagnose-run.ts --symbol US100 --days 5
 */
import type { LighterCandle } from "../../src/lib/lighter/client";
import { diagnoseK2, type K2FunnelStats } from "../../src/lib/kurisko/backtest/k2-diagnose";
import { diagnoseK3, type K3FunnelStats } from "../../src/lib/kurisko/backtest/k3-diagnose";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

/** Minimal synthetic series so smoke works offline. */
function syntheticFixture(): LighterCandle[] {
  const out: LighterCandle[] = [];
  let px = 100;
  const t0 = Date.UTC(2026, 0, 5, 14, 0, 0);
  for (let i = 0; i < 200; i++) {
    const wave = Math.sin(i / 11) * 0.6 + Math.cos(i / 29) * 0.25;
    const o = px;
    const c = px + wave * 0.15;
    out.push({
      t: t0 + i * 60_000,
      o,
      h: Math.max(o, c) + 0.15,
      l: Math.min(o, c) - 0.15,
      c,
      v: 1,
    });
    px = c;
  }
  return out;
}

async function loadCandles(): Promise<{ symbol: string; candles: LighterCandle[] }> {
  if (hasFlag("--fixture")) {
    return { symbol: "FIXTURE", candles: syntheticFixture() };
  }

  const symbol = (argValue("--symbol") ?? "US100").toUpperCase();
  const days = Number(argValue("--days") ?? "5");
  const { loadAzizMarketData } = await import("../../src/lib/aziz/improvement/market-data");
  const market = await loadAzizMarketData({
    symbol,
    resolution: "1m",
    days,
    dataSource: "capital",
  });
  return { symbol, candles: market.candles };
}

function printK2(f: K2FunnelStats) {
  console.log("\n=== K2 funnel (20/20 bull flag) ===");
  console.log(
    [
      `bars=${f.bars}`,
      `upEnv=${f.upChannelOrUpLeg}`,
      `embedBull5m=${f.embeddedBull5m}`,
      `flagpole=${f.flagpole}`,
      `pullback=${f.pullbackQuadDip}`,
      `entryHook=${f.entryHook}`,
      `allPass=${f.allPass}`,
    ].join(" · ")
  );
}

function printK3(f: K3FunnelStats) {
  console.log("\n=== K3 funnel (bear flag / sell strength) ===");
  console.log(
    [
      `bars=${f.bars}`,
      `weakEnv=${f.downChannelOrWeak}`,
      `embedBear5m=${f.embeddedBear5m}`,
      `deadCat=${f.deadCatBounce}`,
      `surge80=${f.surgeToward80}`,
      `sellCross=${f.sellStrengthCross}`,
      `allPass=${f.allPass}`,
      `mandatoryLongExit=${f.mandatoryLongExit}`,
    ].join(" · ")
  );
}

async function main() {
  console.log("K2/K3 diagnose CLI — research only (no orders).");
  const { symbol, candles } = await loadCandles();
  console.log(`Loaded ${candles.length} 1m bars for ${symbol}`);

  const structureMs = 5 * 60_000;
  const k2 = diagnoseK2(candles, structureMs);
  const k3 = diagnoseK3(candles, structureMs);

  printK2(k2.funnel);
  printK3(k3.funnel);

  if (k2.bestMatch) {
    console.log(
      `\nK2 bestMatch bar=${k2.bestMatch.barIndex} pass=${k2.bestMatch.passCount}/${k2.bestMatch.totalSteps} allPass=${k2.bestMatch.allPass}`
    );
    for (const s of k2.bestMatch.steps) {
      console.log(`  [${s.pass ? "PASS" : "FAIL"}] ${s.id}: ${s.detail}`);
    }
  }

  if (k3.bestMatch) {
    console.log(
      `\nK3 bestMatch bar=${k3.bestMatch.barIndex} pass=${k3.bestMatch.passCount}/${k3.bestMatch.totalSteps} allPass=${k3.bestMatch.allPass}`
    );
    for (const s of k3.bestMatch.steps) {
      console.log(`  [${s.pass ? "PASS" : "FAIL"}] ${s.id}: ${s.detail}`);
    }
  }

  console.log("\nLatest bar K2 allPass=", k2.latestBar.allPass, "K3 allPass=", k3.latestBar.allPass);
  console.log("Latest K3 mandatoryLongExit=", k3.latestBar.mandatoryLongExit);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
