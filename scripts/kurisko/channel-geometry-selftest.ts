/**
 * Channel geometry unit smoke — inverted rejection + sloping chart helper.
 * Run: npx tsx scripts/kurisko/channel-geometry-selftest.ts
 */
import {
  buildChannelFrom123,
  channelRailsOriented,
  channelValidDown,
  channelValidK1,
  channelValidUp,
  type ChannelLines,
  type ChannelPivot123,
} from "../../src/lib/kurisko/indicators/channel-geometry";
import {
  episodeRailsOriented,
  episodeToRailSeries,
} from "../../src/lib/kurisko/backtest/channel-chart-draw";
import type { KuriskoChannelEpisodeDraw } from "../../src/lib/kurisko/backtest/chart-window-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

const H4 = 4 * 60 * 60 * 1000;
const t0 = Date.UTC(2026, 8, 1, 12, 0, 0);

/** Diagnosis case: mild inversion — P2 above the P1–P3 upper rail. */
const invertedDown: ChannelPivot123 = {
  kind: "down",
  a: { t: t0, price: 100 },
  b: { t: t0 + H4 / 2, price: 99.3 },
  c: { t: t0 + H4, price: 98 },
};

const builtInverted = buildChannelFrom123(invertedDown);
assert(!builtInverted.valid, "inverted down 1-2-3 must be rejected by buildChannelFrom123");
assert(builtInverted.direction === "none", "inverted → direction none");

// Reconstruct what the OLD builder would have produced (crossed rails) and assert gates fail.
function legacyInvertedDown(): ChannelLines {
  const upperAt = (t: number) => {
    const slope = (98 - 100) / H4;
    return 100 + slope * (t - t0);
  };
  const lowerAt = (t: number) => {
    const slope = (98 - 100) / H4;
    const midT = t0 + H4 / 2;
    return 99.3 + slope * (t - midT);
  };
  return {
    valid: true,
    direction: "down",
    upperAt,
    lowerAt,
    midAt: (t) => (upperAt(t) + lowerAt(t)) / 2,
    pivots: invertedDown,
    slopeDeg: -26.8,
  };
}

const legacy = legacyInvertedDown();
assert(legacy.lowerAt(t0 + H4 / 2) > legacy.upperAt(t0 + H4 / 2), "legacy case is inverted at P2");
assert(!channelRailsOriented(legacy.upperAt, legacy.lowerAt, [t0, t0 + H4 / 2, t0 + H4]), "rails not oriented");
assert(!channelValidDown(legacy), "channelValidDown rejects inverted even with slope in band");
assert(!channelValidK1(legacy), "channelValidK1 rejects inverted");

/** Valid descending: P2 clearly below P1–P3. */
const validDown: ChannelPivot123 = {
  kind: "down",
  a: { t: t0, price: 100 },
  b: { t: t0 + H4 / 2, price: 97 },
  c: { t: t0 + H4, price: 98 },
};
const builtValid = buildChannelFrom123(validDown);
assert(builtValid.valid, "valid down channel builds");
assert(builtValid.direction === "down", "valid down direction");
assert(
  channelRailsOriented(builtValid.upperAt, builtValid.lowerAt, [
    validDown.a.t,
    validDown.b.t,
    validDown.c.t,
  ]),
  "valid rails oriented"
);
assert(builtValid.lowerAt(validDown.b.t) < builtValid.upperAt(validDown.b.t), "lower < upper at P2");
assert(channelValidDown(builtValid), "channelValidDown accepts oriented + slope");
assert(channelValidK1(builtValid), "channelValidK1 accepts valid down");

/** Valid ascending. */
const validUp: ChannelPivot123 = {
  kind: "up",
  a: { t: t0, price: 100 },
  b: { t: t0 + H4 / 2, price: 104 },
  c: { t: t0 + H4, price: 102 },
};
const builtUp = buildChannelFrom123(validUp);
assert(builtUp.valid, "valid up channel builds");
assert(channelValidUp(builtUp), "channelValidUp accepts oriented + slope");

/** Inverted ascending: P2 below lower rail. */
const invertedUp: ChannelPivot123 = {
  kind: "up",
  a: { t: t0, price: 100 },
  b: { t: t0 + H4 / 2, price: 100.2 },
  c: { t: t0 + H4, price: 101 },
};
const builtInvUp = buildChannelFrom123(invertedUp);
assert(!builtInvUp.valid, "inverted up 1-2-3 rejected");

// --- Chart helper: sloping segments ---
const draw: KuriskoChannelEpisodeDraw = {
  kind: "down",
  tConfirm: t0 + H4,
  tStart: t0,
  tEnd: t0 + H4 * 2,
  slopeDeg: -26,
  upperStart: 100,
  upperEnd: 96,
  lowerStart: 97,
  lowerEnd: 93,
  p1: { t: t0, price: 100 },
  p2: { t: t0 + H4 / 2, price: 97 },
  p3: { t: t0 + H4, price: 98 },
  highlight: true,
};
assert(episodeRailsOriented(draw), "episode draw oriented");
const series = episodeToRailSeries(draw);
assert(!!series, "episodeToRailSeries returns series");
assert(series!.sloping, "rails are sloping (not flat one-price)");
assert(series!.upper[0]!.value === 100 && series!.upper[1]!.value === 96, "upper segment endpoints");
assert(series!.lower[0]!.value === 97 && series!.lower[1]!.value === 93, "lower segment endpoints");
assert(series!.mid[0]!.value === 98.5 && series!.mid[1]!.value === 94.5, "mid = mean of rails");

const flatDraw: KuriskoChannelEpisodeDraw = {
  ...draw,
  upperStart: 100,
  upperEnd: 100,
  lowerStart: 97,
  lowerEnd: 97,
};
const flatSeries = episodeToRailSeries(flatDraw);
assert(!!flatSeries, "flat parallel still drawable");
assert(!flatSeries!.sloping, "zero-slope parallel flagged not sloping");

const crossedDraw: KuriskoChannelEpisodeDraw = {
  ...draw,
  upperStart: 97,
  upperEnd: 93,
  lowerStart: 100,
  lowerEnd: 96,
};
assert(!episodeRailsOriented(crossedDraw), "crossed episode rejected");
assert(episodeToRailSeries(crossedDraw) == null, "crossed → no series");

console.log("channel-geometry-selftest: OK");
