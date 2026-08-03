/**
 * Phase 2 smoke: regenerate fixtures, import, run GUS engine with smoke seed, assert outcomes.
 */
import { execSync } from "node:child_process";
import {
  closeDuxDb,
  loadGusSmokeSeed,
  openDuxDb,
  runBacktestOnSymbols,
} from "../../src/lib/dux";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

execSync("npx tsx scripts/dux/generate-fixtures.ts", { stdio: "inherit" });
execSync("npx tsx scripts/dux/import-fixtures.ts", { stdio: "inherit" });

openDuxDb();
const params = loadGusSmokeSeed();
const result = runBacktestOnSymbols(params, ["US.GUSALLOW", "US.GUSCROWD", "US.GUSNANO"]);

const allow = result.days.find((d) => d.symbol === "US.GUSALLOW");
const crowd = result.days.find((d) => d.symbol === "US.GUSCROWD");
const nano = result.days.find((d) => d.symbol === "US.GUSNANO");

assert(!!allow, "missing ALLOW day");
assert(!!crowd, "missing CROWD day");
assert(!!nano, "missing NANO day");

assert(crowd!.skipReason === "crowded_pm", `crowd skip expected crowded_pm got ${crowd!.skipReason}`);
assert(crowd!.trades.length === 0, "crowd should not trade");

assert(nano!.skipReason === "nano_rotation", `nano skip expected nano_rotation got ${nano!.skipReason}`);
assert(nano!.trades.length === 0, "nano should not take standard GUS");
assert(
  nano!.events.some((e) => e.type === "nano_rotation"),
  "nano should journal nano_rotation"
);

assert(allow!.trades.length >= 1, `allow should trade, got ${allow!.trades.length} trades; events=${allow!.events.map((e) => e.type).join(",")}`);
assert(allow!.skipReason == null, `allow should not skip, got ${allow!.skipReason}`);

const trade = allow!.trades[0]!;
assert(trade.shares > 0, "allow trade shares");
assert(trade.legs.some((l) => l.side === "short"), "allow has short leg");
assert(trade.legs.some((l) => l.side === "cover"), "allow has cover leg");

console.log("PHASE2_SMOKE_PASSED", {
  allowTrades: allow!.trades.length,
  allowPnl: Number(trade.pnl.toFixed(2)),
  allowExit: trade.exitReason,
  crowdSkip: crowd!.skipReason,
  nanoSkip: nano!.skipReason,
  summary: result.summary,
});

closeDuxDb();
