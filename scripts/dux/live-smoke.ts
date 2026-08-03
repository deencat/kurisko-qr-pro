/**
 * Phase 4 smoke: mock broker + gates (no OpenD) → PHASE4_LIVE_PASSED
 */
import {
  closeDuxDb,
  evaluateIntent,
  intentsFromTrades,
  loadGusSmokeSeed,
  loadLiveConfig,
  MockBroker,
  openDuxDb,
  recentLiveRuns,
  runLiveSession,
  runPaperSession,
} from "../../src/lib/dux";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

async function main() {
  openDuxDb();
  const params = loadGusSmokeSeed();

  // Ensure paper/backtest intents exist
  const paper = runPaperSession({
    params,
    symbols: ["US.GUSALLOW", "US.GUSCROWD", "US.GUSNANO"],
    mode: "parity",
    persist: false,
  });
  const intents = intentsFromTrades(paper.trades);
  assert(intents.length > 0, "need intents from ALLOW trade");

  // 1) Empty allowlist → all rejected
  const blocked = await runLiveSession({
    intents,
    config: {
      armed: false,
      allowlist: [],
      broker: "mock",
      kill: false,
      maxShares: 100,
      maxNotional: 2000,
      trdEnv: "SIMULATE",
      host: "127.0.0.1",
      port: 11111,
    },
    broker: new MockBroker(50),
    persist: true,
  });
  assert(blocked.rejected === blocked.tickets.length, "empty allowlist rejects all");
  assert(blocked.submitted === 0, "no submits when rejected");

  // 2) Allowlisted dry-run + clamp to max_sell_short=5
  const allowSym = "US.GUSALLOW";
  const bigIntent = intents
    .filter((i) => i.symbol === allowSym)
    .map((i) => ({ ...i, shares: Math.max(i.shares, 100) }));
  const dry = await runLiveSession({
    intents: bigIntent,
    config: {
      armed: false,
      allowlist: [allowSym],
      broker: "mock",
      kill: false,
      maxShares: 100,
      maxNotional: 50_000,
      trdEnv: "SIMULATE",
      host: "127.0.0.1",
      port: 11111,
    },
    broker: new MockBroker(5),
    persist: true,
  });
  assert(dry.submitted === 0, "unarmed must not submit");
  const shortDry = dry.tickets.find((t) => t.intent.side === "short" && t.status === "dry_run");
  assert(!!shortDry, "expect dry_run short");
  assert(shortDry!.clampedShares === 5, `clamp to max_sell_short got ${shortDry!.clampedShares}`);

  // 3) Kill switch
  const killed = await runLiveSession({
    intents: bigIntent.slice(0, 1),
    config: {
      armed: true,
      allowlist: [allowSym],
      broker: "mock",
      kill: true,
      maxShares: 100,
      maxNotional: 2000,
      trdEnv: "SIMULATE",
      host: "127.0.0.1",
      port: 11111,
    },
    broker: new MockBroker(50),
    persist: true,
  });
  assert(killed.tickets.every((t) => t.status === "killed"), "kill switch");

  // 4) Armed mock submit
  const armed = await runLiveSession({
    intents: bigIntent.filter((i) => i.side === "short").slice(0, 1),
    config: {
      armed: true,
      allowlist: [allowSym],
      broker: "mock",
      kill: false,
      maxShares: 100,
      maxNotional: 50_000,
      trdEnv: "SIMULATE",
      host: "127.0.0.1",
      port: 11111,
    },
    broker: new MockBroker(5),
    persist: true,
  });
  assert(armed.submitted === 1, "armed mock submits once");
  assert(armed.tickets[0]!.brokerOrderId?.startsWith("MOCK-"), "mock order id");

  // Gate unit: loadLiveConfig defaults unarmed
  const cfg = loadLiveConfig({ allowlist: ["US.X"] });
  assert(cfg.armed === false, "default unarmed");
  const d = evaluateIntent(
    { symbol: "US.X", side: "short", shares: 10, price: 5, reason: "t", t: 1 },
    { ...cfg, allowlist: ["US.X"] }
  );
  assert(d.ok && d.dryRun, "unarmed dryRun");

  const runs = recentLiveRuns(5);
  assert(runs.length >= 1, "live_runs written");

  console.log("PHASE4_LIVE_PASSED", {
    blockedRejected: blocked.rejected,
    dryClamped: shortDry!.clampedShares,
    killed: killed.tickets.length,
    armedSubmitted: armed.submitted,
  });

  closeDuxDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
