/**
 * Sweep one param family vs smoke baseline on FIX_* symbols; write ranked JSON.
 */
import fs from "node:fs";
import path from "node:path";
import {
  closeDuxDb,
  duxDataDir,
  loadGusSmokeSeed,
  openDuxDb,
  PARAM_FAMILIES,
  sweepFamily,
} from "../../src/lib/dux";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const family = arg("--family") ?? "gap_min";
if (!PARAM_FAMILIES[family]) {
  console.error(`Unknown family '${family}'. Known: ${Object.keys(PARAM_FAMILIES).join(", ")}`);
  process.exit(1);
}

openDuxDb();
const baseline = loadGusSmokeSeed();
const symbols = ["US.GUSALLOW", "US.GUSCROWD", "US.GUSNANO"];
const rows = sweepFamily(baseline, family, symbols);

const outDir = path.join(duxDataDir(), "runs");
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = path.join(outDir, `sweep-${family}-${stamp}.json`);
fs.writeFileSync(
  outPath,
  JSON.stringify({ family, at: Date.now(), rows }, null, 2)
);

console.log(`Sweep family=${family} (ranked by expectancy)`);
for (const row of rows) {
  const ov = JSON.stringify(row.overrides);
  console.log(
    `  ${ov} trades=${row.summary.trades} exp=${row.summary.expectancy.toFixed(2)} pnl=${row.summary.totalPnl.toFixed(2)} wr=${(row.summary.winRate * 100).toFixed(0)}%`
  );
}
console.log("Wrote", outPath);
closeDuxDb();
