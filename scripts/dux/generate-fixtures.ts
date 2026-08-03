/**
 * Generate three synthetic FIX_* day fixtures under docs/dux/fixtures/.
 * Times are unix ms for a representative US equity session (2024-06-03 ET).
 *
 * Phase 2: ALLOW includes push → consol → crack → fade so the GUS engine can trade.
 */
import fs from "node:fs";
import path from "node:path";
import { fixturesDir } from "../../src/lib/dux";

const DAY = "2024-06-03";

function etToMs(hour: number, minute: number): number {
  const pad = (n: number) => String(n).padStart(2, "0");
  return Date.parse(`${DAY}T${pad(hour)}:${pad(minute)}:00-04:00`);
}

function bar(t: number, o: number, h: number, l: number, c: number, v: number) {
  return { resolution: "1m" as const, t, o, h, l, c, v };
}

/** Deterministic 1m series (no Math.random — stable fixtures). */
function fillRange(
  startH: number,
  startM: number,
  endH: number,
  endM: number,
  priceFn: (i: number) => { o: number; h: number; l: number; c: number },
  volFn: (i: number) => number
) {
  const out = [];
  let i = 0;
  for (let mins = startH * 60 + startM; mins < endH * 60 + endM; mins++) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const p = priceFn(i);
    out.push(bar(etToMs(h, m), p.o, p.h, p.l, p.c, volFn(i)));
    i++;
  }
  return out;
}

function flatPx(px: number, wiggle = 0.004) {
  return (i: number) => {
    const o = px * (1 + ((i % 5) - 2) * wiggle * 0.1);
    const c = px * (1 + ((i % 7) - 3) * wiggle * 0.1);
    return { o, c, h: Math.max(o, c) * (1 + wiggle), l: Math.min(o, c) * (1 - wiggle) };
  };
}

function writeFixture(name: string, body: unknown) {
  const dir = fixturesDir();
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${name}.json`);
  fs.writeFileSync(p, JSON.stringify(body, null, 2));
  console.log("Wrote", p);
}

// Prior close $4.00 → open $8.40 = +110%. Price ref >= $3 hard filter.
// PM ~13.2M shares. Push +20% to ~10.08, 60m consol, crack, fade.
const allowRth = [
  // 09:30–10:15 push from 8.40 → ~10.10 (~45 bars)
  ...fillRange(
    9,
    30,
    10,
    15,
    (i) => {
      const px = 8.4 + Math.min(i, 44) * (1.7 / 44);
      return { o: px, c: px + 0.02, h: px + 0.05, l: px - 0.02 };
    },
    () => 80_000
  ),
  // 10:15–11:20 consolidation ~65m, width ~4% around mid ~9.95
  ...fillRange(
    10,
    15,
    11,
    20,
    (i) => {
      const mid = 9.95;
      const o = mid + ((i % 6) - 2.5) * 0.03;
      const c = mid + ((i % 5) - 2) * 0.03;
      return { o, c, h: Math.max(o, c, mid + 0.18), l: Math.min(o, c, mid - 0.18) };
    },
    () => 60_000
  ),
  // 11:20–11:35 crack: drop ~6% below consol low (~9.77) → toward 9.1
  ...fillRange(
    11,
    20,
    11,
    35,
    (i) => {
      const px = 9.7 - i * 0.04;
      return { o: px + 0.05, c: px, h: px + 0.06, l: px - 0.08 };
    },
    () => 90_000
  ),
  // 11:35–15:55 fade lower for scale-ladder covers (caps high so stop above consol is not retested)
  ...fillRange(
    11,
    35,
    15,
    55,
    (i) => {
      const px = 9.1 - Math.min(i, 200) * 0.008;
      return { o: px + 0.02, c: px, h: Math.min(px + 0.04, 9.5), l: px - 0.05 };
    },
    () => 40_000
  ),
  // 15:55–16:00 flat
  ...fillRange(15, 55, 16, 0, flatPx(7.5), () => 20_000),
];

const allow = {
  id: "FIX_ALLOW_STANDARD",
  symbol: "US.GUSALLOW",
  intent: "Open gap ≥100%, mid PM volume, push/consol/crack → standard GUS path trades",
  meta: {
    floatShares: 8_000_000,
    mcapUsd: 40_000_000,
    sector: "Technology",
    isBiotech: false,
    isEnergy: false,
    isChinaAdr: false,
  },
  candles: [
    { resolution: "1d" as const, t: etToMs(16, 0) - 86_400_000, o: 3.8, h: 4.2, l: 3.6, c: 4.0, v: 2_000_000 },
    ...fillRange(4, 0, 9, 30, flatPx(7.6), () => 40_000), // ~13.2M PM
    ...allowRth,
  ],
};

const crowded = {
  id: "FIX_CROWDED_DENY",
  symbol: "US.GUSCROWD",
  intent: "PM volume >50M → block standard GUS",
  meta: {
    floatShares: 12_000_000,
    mcapUsd: 80_000_000,
    sector: "Consumer",
    isBiotech: false,
    isEnergy: false,
    isChinaAdr: false,
  },
  candles: [
    { resolution: "1d" as const, t: etToMs(16, 0) - 86_400_000, o: 3.5, h: 3.8, l: 3.3, c: 3.6, v: 5_000_000 },
    ...fillRange(4, 0, 9, 30, flatPx(7.0), () => 220_000), // ~72.6M PM
    ...fillRange(9, 30, 16, 0, flatPx(7.5), () => 100_000),
  ],
};

const nano = {
  id: "FIX_NANO_ROTATION",
  symbol: "US.GUSNANO",
  intent: "Float <2M and high PM rotation → pullback variant path (no standard GUS)",
  meta: {
    floatShares: 1_500_000,
    mcapUsd: 25_000_000,
    sector: "Healthcare",
    isBiotech: false,
    isEnergy: false,
    isChinaAdr: false,
  },
  candles: [
    { resolution: "1d" as const, t: etToMs(16, 0) - 86_400_000, o: 4.0, h: 4.3, l: 3.8, c: 4.1, v: 500_000 },
    ...fillRange(4, 0, 9, 30, flatPx(9.0), () => 80_000), // ~26.4M PM → rotation ~17.6x
    ...fillRange(
      9,
      30,
      16,
      0,
      (i) => {
        const px = 10 - Math.min(i, 120) * 0.02;
        return { o: px, c: px - 0.01, h: px + 0.05, l: px - 0.05 };
      },
      () => 50_000
    ),
  ],
};

writeFixture("FIX_ALLOW_STANDARD", allow);
writeFixture("FIX_CROWDED_DENY", crowded);
writeFixture("FIX_NANO_ROTATION", nano);
