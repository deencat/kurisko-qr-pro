/**
 * Run GUS backtest on fixtures or explicit symbols; write JSON under data/dux/runs/.
 */
import fs from "node:fs";
import path from "node:path";
import {
  closeDuxDb,
  duxDataDir,
  loadGusSmokeSeed,
  openDuxDb,
  runBacktest,
  runBacktestOnSymbols,
} from "../../src/lib/dux";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

openDuxDb();
const params = loadGusSmokeSeed();
const fixtureSymbols = ["US.GUSALLOW", "US.GUSCROWD", "US.GUSNANO"];

let result;
if (has("--all-fixtures") || (!arg("--symbol") && !has("--all"))) {
  result = runBacktestOnSymbols(params, fixtureSymbols);
} else if (arg("--symbol")) {
  result = runBacktestOnSymbols(params, [arg("--symbol")!]);
} else {
  result = runBacktest(params);
}

const outDir = path.join(duxDataDir(), "runs");
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = path.join(outDir, `backtest-${stamp}.json`);

const payload = {
  at: Date.now(),
  summary: result.summary,
  days: result.days.map((d) => ({
    symbol: d.symbol,
    dayKey: d.dayKey,
    skipReason: d.skipReason,
    trades: d.trades.length,
    pnl: d.trades.reduce((s, t) => s + t.pnl, 0),
    events: d.events.map((e) => e.type),
  })),
  trades: result.trades,
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(result.summary, null, 2));
console.log("Wrote", outPath);
closeDuxDb();
