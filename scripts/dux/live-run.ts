/**
 * Live / dry-run session from latest paper trades.
 * Default: mock broker, unarmed dry-run. Use --broker futu only with OpenD + allowlist.
 */
import fs from "node:fs";
import path from "node:path";
import {
  closeDuxDb,
  createBroker,
  duxDataDir,
  intentsFromTrades,
  loadGusSmokeSeed,
  loadLiveConfig,
  openDuxDb,
  runLiveSession,
  runPaperSession,
} from "../../src/lib/dux";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  openDuxDb();
  const params = loadGusSmokeSeed();
  const symbol = arg("--symbol") ?? "US.GUSALLOW";
  const brokerKind = (arg("--broker") ?? "mock") as "mock" | "futu" | "webull";

  const paper = runPaperSession({
    params,
    symbols: [symbol],
    mode: "forward",
    persist: false,
  });
  const intents = intentsFromTrades(paper.trades);
  if (!intents.length) {
    console.error(`No trade intents for ${symbol} (skipped or no setup).`);
    process.exit(2);
  }

  const base = loadLiveConfig();
  const config = {
    ...base,
    broker: brokerKind,
    allowlist: base.allowlist.length ? base.allowlist : [symbol],
  };

  const result = await runLiveSession({
    intents,
    config,
    broker: createBroker(config),
    persist: true,
  });

  const outDir = path.join(duxDataDir(), "runs");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `live-${stamp}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        runId: result.runId,
        armed: result.config.armed,
        trdEnv: result.config.trdEnv,
        broker: result.config.broker,
        submitted: result.submitted,
        dryRun: result.dryRun,
        rejected: result.rejected,
        tickets: result.tickets,
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        armed: result.config.armed,
        submitted: result.submitted,
        dryRun: result.dryRun,
        rejected: result.rejected,
      },
      null,
      2
    )
  );
  console.log("Wrote", outPath);
  if (has("--broker") && brokerKind === "futu" && !result.config.armed) {
    console.log("Note: unarmed — dry-run only. Set DUX_LIVE_ARMED=1 to place via OpenD.");
  }
  closeDuxDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
