/**
 * Forward paper session on fixtures or --symbol; journals to SQLite.
 */
import fs from "node:fs";
import path from "node:path";
import {
  closeDuxDb,
  duxDataDir,
  loadGusSmokeSeed,
  openDuxDb,
  runPaperSession,
} from "../../src/lib/dux";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

openDuxDb();
const params = loadGusSmokeSeed();
const symbol = arg("--symbol");
const symbols = symbol ? [symbol] : ["US.GUSALLOW", "US.GUSCROWD", "US.GUSNANO"];

const paper = runPaperSession({ params, symbols, mode: "forward", persist: true });

const outDir = path.join(duxDataDir(), "runs");
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = path.join(outDir, `paper-${stamp}.json`);
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      runId: paper.runId,
      mode: paper.mode,
      parity: paper.parity,
      summary: paper.backtest.summary,
      orders: paper.orders.length,
      trades: paper.trades,
    },
    null,
    2
  )
);

console.log(JSON.stringify({ runId: paper.runId, summary: paper.backtest.summary, parity: paper.parity }, null, 2));
console.log("Wrote", outPath);
closeDuxDb();
