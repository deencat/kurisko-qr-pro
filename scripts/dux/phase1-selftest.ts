/**
 * Phase 1 self-test: regenerate fixtures, import, assert PM volume / rotation properties.
 */
import { execSync } from "node:child_process";
import {
  candleStats,
  closeDuxDb,
  getCandles,
  loadGusSmokeSeed,
  openDuxDb,
  upsertCandles,
  makeCandle,
  logIngest,
} from "../../src/lib/dux";

function pmVol(symbol: string): number {
  return getCandles({ symbol, resolution: "1m", session: "pm" }).reduce((s, b) => s + b.v, 0);
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

execSync("npx tsx scripts/dux/generate-fixtures.ts", { stdio: "inherit" });
execSync("npx tsx scripts/dux/import-fixtures.ts", { stdio: "inherit" });

openDuxDb();
const seed = loadGusSmokeSeed();
assert(seed.strategy === "gus", "smoke strategy");
assert(seed.gap_min === 1, "smoke gap_min");
assert(seed.crowded_pm_m === 50, "smoke crowded");
assert(seed.K === 10, "smoke K");

const allowPm = pmVol("US.GUSALLOW") / 1e6;
const crowdPm = pmVol("US.GUSCROWD") / 1e6;
const nanoPm = pmVol("US.GUSNANO") / 1e6;
const nanoRot = pmVol("US.GUSNANO") / 1.5e6;

assert(allowPm > 5 && allowPm < 50, `allow mid PM got ${allowPm}`);
assert(crowdPm > 50, `crowd >50M got ${crowdPm}`);
assert(nanoRot > 15, `nano rotation >15 got ${nanoRot}`);

const stats = candleStats();
assert(stats.some((s) => s.symbol === "US.GUSALLOW" && s.resolution === "1m" && s.bars === 720), "allow 1m bars");
assert(stats.some((s) => s.symbol === "US.GUSCROWD" && s.resolution === "1m" && s.bars === 720), "crowd 1m bars");
assert(stats.some((s) => s.symbol === "US.GUSNANO" && s.resolution === "1m" && s.bars === 720), "nano 1m bars");

// Upsert idempotency: re-insert one bar, count unchanged
const one = getCandles({ symbol: "US.GUSALLOW", resolution: "1m" })[0]!;
upsertCandles([makeCandle({ ...one, source: "idempotency-test" })]);
const after = candleStats().find((s) => s.symbol === "US.GUSALLOW" && s.resolution === "1m")!;
assert(after.bars === 720, `idempotent upsert expected 720 got ${after.bars}`);

logIngest({
  symbol: "SELFTEST",
  resolution: "1m",
  startDate: "phase1",
  endDate: "phase1",
  bars: 0,
  status: "ok",
  message: "phase1-selftest passed",
  at: Date.now(),
});

console.log("PHASE1_SELFTEST_PASSED", {
  allowPmM: Number(allowPm.toFixed(2)),
  crowdPmM: Number(crowdPm.toFixed(2)),
  nanoRot: Number(nanoRot.toFixed(2)),
});
closeDuxDb();
