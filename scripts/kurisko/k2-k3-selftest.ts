/**
 * Unit smoke for K2/K3 helpers, entry/exit, and diagnose gates (no Capital).
 * Criteria from `.documents/John_Kurisko_QuadRotation_Scalping_RAG.md` STRATEGY K2/K3.
 */
import {
  buildK2EntryLevels,
  buildK3EntryLevels,
  checkK2ExitOnBar,
  checkK3ExitOnBar,
} from "../../src/lib/kurisko/backtest/k2-k3-entry-exit";
import {
  belowExecEma20And50,
  belowStructEma200,
  emaRising,
  flagpoleOffEma20,
  k2EntryHook,
  k3MandatoryLongExit,
  k3SellStrengthCross,
  nearEma20,
  pullbackHoldsEma20,
  quadDipToward20,
  stochSurgeToward80,
  strongUpLegStruct,
} from "../../src/lib/kurisko/backtest/k2-k3-helpers";
import { diagnoseK2Funnel, stepsSummaryK2 } from "../../src/lib/kurisko/backtest/k2-diagnose";
import { diagnoseK3Funnel, stepsSummaryK3 } from "../../src/lib/kurisko/backtest/k3-diagnose";
import { resolveK2Stage, resolveK3Stage } from "../../src/lib/kurisko/snapshot/k2-k3-stage";
import { embeddedBear, embeddedBull, type QuadStochStack } from "../../src/lib/kurisko/indicators/stochastic-quad";
import type { LighterCandle } from "../../src/lib/lighter/client";
import type { KuriskoCriterionStep } from "../../src/lib/kurisko/backtest/criterion-step";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

function stackFrom(rows: { A: number; B: number; C: number; D: number }[]): QuadStochStack {
  return {
    A: rows.map((r) => r.A),
    B: rows.map((r) => r.B),
    C: rows.map((r) => r.C),
    D: rows.map((r) => r.D),
  };
}

function candle(t: number, o: number, h: number, l: number, c: number): LighterCandle {
  return { t, o, h, l, c, v: 1 };
}

// --- Embedded 60,10 (video / RAG) ---
{
  const bull = stackFrom([
    { A: 50, B: 50, C: 50, D: 82 },
    { A: 40, B: 45, C: 55, D: 85 },
    { A: 30, B: 40, C: 50, D: 88 },
  ]);
  assert(embeddedBull(bull, 2, 3), "EMBEDDED_BULL when D≥80 ×3");
  assert(!embeddedBull(bull, 2, 4), "EMBEDDED_BULL fails shorter history for 4 bars");

  const bear = stackFrom([
    { A: 50, B: 50, C: 50, D: 18 },
    { A: 60, B: 55, C: 45, D: 15 },
    { A: 70, B: 60, C: 40, D: 12 },
  ]);
  assert(embeddedBear(bear, 2, 3), "EMBEDDED_BEAR when D≤20 ×3");
}

// --- K2 helpers ---
{
  assert(emaRising([10, 11, 12, 13], 3, 2), "EMA rising");
  assert(strongUpLegStruct(110, 100, [98, 99, 100], 2), "K2_E1 up-leg");
  assert(!strongUpLegStruct(95, 100, [98, 99, 100], 2), "reject price under EMA_20");

  const bars: LighterCandle[] = [
    candle(0, 100, 101, 99, 100.5),
    candle(1, 100.5, 102, 100.4, 101.8), // green above ema
    candle(2, 101.8, 103, 101.7, 102.9), // green above ema
    candle(3, 102.9, 103.2, 102.5, 102.6),
  ];
  const ema20 = [100, 100.2, 100.5, 100.8];
  const pole = flagpoleOffEma20(bars, ema20, 3, 4);
  assert(pole.ok && pole.greenBars >= 2, "K2_E3 flagpole ≥2 green");

  const pull = candle(4, 102, 102.2, 100.76, 101);
  assert(nearEma20(pull, 100.8, 0.001), "pullback near EMA_20");
  assert(pullbackHoldsEma20(pull, 100.8), "low holds EMA_20 buffer");

  const dipStack = stackFrom([
    { A: 50, B: 60, C: 70, D: 85 },
    { A: 28, B: 35, C: 45, D: 70 }, // quad dip — A toward 20
    { A: 20, B: 25, C: 40, D: 65 },
  ]);
  assert(quadDipToward20(dipStack, 2).ok, "K2_E4 quad dip toward 20");

  const hookStack = stackFrom([
    { A: 18, B: 30, C: 40, D: 60 },
    { A: 21, B: 32, C: 42, D: 62 },
  ]);
  assert(k2EntryHook(hookStack, 1), "K2 entry: A≤22 and hooks up");
}

// --- K3 helpers ---
{
  assert(belowStructEma200(90, 100), "K3_E1 alt under EMA_200");
  assert(belowExecEma20And50(99, 100, 101), "below EMA_20 and 50");
  assert(!belowExecEma20And50(102, 100, 101), "reject above EMAs");

  const surge = stackFrom([
    { A: 68, B: 50, C: 40, D: 15 },
    { A: 79, B: 55, C: 42, D: 14 },
  ]);
  assert(stochSurgeToward80(surge, 1), "K3_E4 surge toward 80");
  assert(k3SellStrengthCross(surge, 1), "K3 sell-strength cross 78");

  assert(k3MandatoryLongExit(81, true), "mandatory long exit under K3 macro");
  assert(!k3MandatoryLongExit(81, false), "no mandatory exit without macro");
  assert(!k3MandatoryLongExit(70, true), "no mandatory exit before A≥80");
}

// --- Entry / exit levels ---
{
  const k2 = buildK2EntryLevels({
    entryPrice: 100,
    pullbackLow: 99.2,
    ema20: 99.5,
    targetPrice: 103,
  });
  assert(!!k2 && k2.stopPrice < 99.2, "K2 SL under min(pullback, ema20)");
  assert(k2!.targetPrice === 103, "K2 TP");

  const badK2 = buildK2EntryLevels({
    entryPrice: 100,
    pullbackLow: 99,
    ema20: 99,
    targetPrice: 99.5,
  });
  assert(badK2 == null, "reject K2 when TP not above entry");

  const k3 = buildK3EntryLevels({ entryPrice: 100, bounceHigh: 101, targetPrice: 97 });
  assert(!!k3 && k3.stopPrice > 101, "K3 SL above bounce high");

  const posK2 = { side: "long" as const, entryBar: 10, stopPrice: 99, targetPrice: 103 };
  const stopHit = checkK2ExitOnBar(posK2, 11, { t: 1, o: 100, h: 100.5, l: 98.5, c: 99 }, 40, 35);
  assert(stopHit.exit && stopHit.reason === "stop", "K2 stop");

  const stochHit = checkK2ExitOnBar(posK2, 11, { t: 1, o: 100, h: 101, l: 99.5, c: 100.8 }, 81, 79);
  assert(stochHit.exit && stochHit.reason === "stoch_a", "K2 STOCH_A≥80 exit");

  const embedLost = checkK2ExitOnBar(
    posK2,
    11,
    { t: 1, o: 100, h: 101, l: 99.5, c: 100.5 },
    50,
    48,
    { embedBullLost: true }
  );
  assert(embedLost.exit && embedLost.reason === "embed_lost", "K2 embed lost invalidation");

  const posK3 = { side: "short" as const, entryBar: 10, stopPrice: 102, targetPrice: 97 };
  const k3Stoch = checkK3ExitOnBar(posK3, 11, { t: 1, o: 100, h: 100.2, l: 99, c: 99.5 }, 19, 21);
  assert(k3Stoch.exit && k3Stoch.reason === "stoch_a", "K3 short STOCH_A<20 TP alt");

  const mand = checkK3ExitOnBar(
    { side: "long", entryBar: 5, stopPrice: 98, targetPrice: 105 },
    11,
    { t: 1, o: 100, h: 101, l: 99.5, c: 100.8 },
    82,
    75,
    { k3MacroActive: true }
  );
  assert(mand.exit && mand.reason === "mandatory_long_exit", "K3 mandatory long exit");
}

// --- Stage resolvers ---
{
  const k2Steps: KuriskoCriterionStep[] = [
    { id: "k2_e1_up_env", label: "", pass: true, detail: "" },
    { id: "k2_e2_embedded_bull", label: "", pass: true, detail: "" },
    { id: "k2_e3_flagpole", label: "", pass: true, detail: "" },
    { id: "k2_e4_pullback", label: "", pass: true, detail: "" },
    { id: "k2_entry_hook", label: "", pass: false, detail: "" },
  ];
  assert(resolveK2Stage(k2Steps, false) === "PULLBACK", "K2 stage PULLBACK");
  assert(resolveK2Stage(k2Steps, true) === "SIGNAL", "K2 stage SIGNAL on allPass");

  const k3Steps: KuriskoCriterionStep[] = [
    { id: "k3_e1_weak_env", label: "", pass: true, detail: "" },
    { id: "k3_e2_embedded_bear", label: "", pass: true, detail: "" },
    { id: "k3_e3_dead_cat", label: "", pass: false, detail: "" },
  ];
  assert(resolveK3Stage(k3Steps, false) === "ARM", "K3 stage ARM on embed env");
}

// --- Funnel wiring on synthetic tape (warmup only; expect zeros is OK) ---
{
  const synthetic: LighterCandle[] = [];
  let px = 100;
  const t0 = Date.UTC(2026, 0, 2, 14, 0, 0);
  for (let i = 0; i < 120; i++) {
    const drift = Math.sin(i / 8) * 0.4;
    const o = px;
    const c = px + drift;
    synthetic.push(candle(t0 + i * 60_000, o, Math.max(o, c) + 0.2, Math.min(o, c) - 0.2, c));
    px = c;
  }
  const k2f = diagnoseK2Funnel(synthetic, 5 * 60_000);
  const k3f = diagnoseK3Funnel(synthetic, 5 * 60_000);
  assert(k2f.bars === 120, "K2 funnel bars");
  assert(k3f.bars === 120, "K3 funnel bars");
  assert(typeof k2f.allPass === "number" && typeof k3f.mandatoryLongExit === "number", "funnel counts");
}

// --- stepsSummary requires core ids ---
{
  const partial: KuriskoCriterionStep[] = [
    { id: "k2_e1_up_env", label: "", pass: true, detail: "" },
    { id: "k2_e2_embedded_bull", label: "", pass: true, detail: "" },
  ];
  assert(!stepsSummaryK2(partial).allPass, "K2 allPass needs full core set");
  assert(!stepsSummaryK3(partial).allPass, "K3 allPass ignores foreign ids");
}

console.log("K2_K3_SELFTEST_PASSED", {
  embedded: true,
  helpers: true,
  exits: true,
  stages: true,
  funnel: true,
});
