/**
 * Phase 3 smoke: fixtures → paper parity vs backtest → PHASE3_PAPER_PASSED
 */
import { execSync } from "node:child_process";
import {
  closeDuxDb,
  loadGusSmokeSeed,
  openDuxDb,
  recentPaperRuns,
  runPaperSession,
} from "../../src/lib/dux";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

execSync("npx tsx scripts/dux/generate-fixtures.ts", { stdio: "inherit" });
execSync("npx tsx scripts/dux/import-fixtures.ts", { stdio: "inherit" });

openDuxDb();
const params = loadGusSmokeSeed();
const symbols = ["US.GUSALLOW", "US.GUSCROWD", "US.GUSNANO"];
const paper = runPaperSession({ params, symbols, mode: "parity", persist: true });

assert(!!paper.parity, "parity report missing");
assert(paper.parity!.ok, `parity failed: ${JSON.stringify(paper.parity!.mismatches)}`);
assert(paper.runId != null && paper.runId > 0, "paper run id");

const allow = paper.backtest.days.find((d) => d.symbol === "US.GUSALLOW");
const crowd = paper.backtest.days.find((d) => d.symbol === "US.GUSCROWD");
const nano = paper.backtest.days.find((d) => d.symbol === "US.GUSNANO");

assert(!!allow && allow.trades.length >= 1, "ALLOW must trade");
assert(crowd?.skipReason === "crowded_pm", "CROWD skip");
assert(nano?.skipReason === "nano_rotation", "NANO skip");
assert(paper.orders.some((o) => o.side === "short" && o.symbol === "US.GUSALLOW"), "shadow short order");
assert(paper.orders.some((o) => o.side === "cover" && o.symbol === "US.GUSALLOW"), "shadow cover order");

const runs = recentPaperRuns(1);
assert(runs.length === 1 && runs[0]!.status === "ok", "paper_runs status ok");

console.log("PHASE3_PAPER_PASSED", {
  runId: paper.runId,
  trades: paper.trades.length,
  orders: paper.orders.length,
  allowPnl: allow!.trades[0]!.pnl,
  parityOk: paper.parity!.ok,
});

closeDuxDb();
