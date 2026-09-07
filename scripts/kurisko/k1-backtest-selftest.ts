/**
 * Unit smoke for K1 entry/exit helpers (no Capital, no network).
 */
import {
  applyRoundTripCost,
  buildK1EntryLevels,
  checkK1ExitOnBar,
} from "../../src/lib/kurisko/backtest/k1-entry-exit";
import { summarizeK1Trades } from "../../src/lib/kurisko/backtest/k1-metrics";
import type { K1Trade } from "../../src/lib/kurisko/backtest/k1-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

// --- Entry levels ---
const longLevels = buildK1EntryLevels({
  side: "long",
  entryPrice: 100,
  swingLow: 99,
  swingHigh: 101,
  channelMid: 102,
});
assert(!!longLevels, "long levels");
assert(longLevels!.stopPrice < 99, "long stop under swing");
assert(longLevels!.targetPrice === 102, "long TP mid");

const badLong = buildK1EntryLevels({
  side: "long",
  entryPrice: 100,
  swingLow: 99,
  swingHigh: 101,
  channelMid: 99.5, // mid below entry
});
assert(badLong == null, "reject long when mid not above entry");

const shortLevels = buildK1EntryLevels({
  side: "short",
  entryPrice: 100,
  swingLow: 99,
  swingHigh: 101,
  channelMid: 98,
});
assert(!!shortLevels, "short levels");
assert(shortLevels!.stopPrice > 101, "short stop above swing");

// --- Exits: stop ---
const posLong = {
  side: "long" as const,
  entryBar: 10,
  stopPrice: 99,
  targetPrice: 102,
};
const stopHit = checkK1ExitOnBar(posLong, 11, { t: 1, o: 100, h: 100.5, l: 98.5, c: 99.2 }, 40, 35);
assert(stopHit.exit && stopHit.reason === "stop", "long stop");
assert(stopHit.exit && stopHit.price === 99, "long stop fill");

// --- Exits: TP mid ---
const tpHit = checkK1ExitOnBar(posLong, 11, { t: 1, o: 100, h: 102.5, l: 99.5, c: 102.1 }, 40, 35);
assert(tpHit.exit && tpHit.reason === "tp_mid", "long tp");

// --- Exits: STOCH_A cross 80 ---
const stochHit = checkK1ExitOnBar(posLong, 11, { t: 1, o: 100, h: 101, l: 99.5, c: 100.8 }, 81, 79);
assert(stochHit.exit && stochHit.reason === "stoch_a", "long stoch_a cross 80");

// --- Exits: time stop ---
const timeHit = checkK1ExitOnBar(
  posLong,
  31,
  { t: 1, o: 100, h: 101, l: 99.5, c: 100.2 },
  50,
  48,
  { timeStopBars: 20 }
);
assert(timeHit.exit && timeHit.reason === "time_stop", "time stop at 20 bars");

// --- Short stoch 20 ---
const posShort = {
  side: "short" as const,
  entryBar: 10,
  stopPrice: 101,
  targetPrice: 98,
};
const shortStoch = checkK1ExitOnBar(posShort, 11, { t: 1, o: 100, h: 100.2, l: 99, c: 99.5 }, 19, 21);
assert(shortStoch.exit && shortStoch.reason === "stoch_a", "short stoch_a cross 20");

// --- Costs ---
const costed = applyRoundTripCost({
  side: "long",
  qty: 10,
  entryPrice: 100,
  exitPrice: 101,
  costBpsPerSide: 0.0001,
});
assert(costed.grossPnl === 10, "gross pnl");
assert(costed.netPnl < costed.grossPnl, "costs reduce net");

// --- Metrics PF ---
const sampleTrades: K1Trade[] = [
  {
    id: 1,
    side: "long",
    entryBar: 1,
    exitBar: 2,
    entryTs: 1,
    exitTs: 2,
    entryPrice: 100,
    exitPrice: 101,
    stopPrice: 99,
    targetPrice: 102,
    qty: 1,
    grossPnl: 10,
    costs: 0.1,
    netPnl: 9.9,
    exitReason: "tp_mid",
    barsHeld: 1,
  },
  {
    id: 2,
    side: "long",
    entryBar: 3,
    exitBar: 4,
    entryTs: 3,
    exitTs: 4,
    entryPrice: 100,
    exitPrice: 99,
    stopPrice: 99,
    targetPrice: 102,
    qty: 1,
    grossPnl: -5,
    costs: 0.1,
    netPnl: -5.1,
    exitReason: "stop",
    barsHeld: 1,
  },
];
const summary = summarizeK1Trades("TEST", 100, sampleTrades, 2);
assert(summary.trades === 2, "trade count");
assert(Math.abs(summary.profitFactor! - 2) < 1e-9, `PF expected 2 got ${summary.profitFactor}`);
assert(summary.wins === 1 && summary.losses === 1, "W/L");

console.log("K1_ENTRY_EXIT_SELFTEST_PASSED", {
  pf: summary.profitFactor,
  winRate: summary.winRate,
});
