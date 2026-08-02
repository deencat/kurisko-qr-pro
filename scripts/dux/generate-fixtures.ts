/**
 * Generate three synthetic FIX_* day fixtures under data/dux/fixtures/.
 * Times are unix ms for a representative US equity session (2024-06-03 ET).
 */
import fs from "node:fs";
import path from "node:path";
import { fixturesDir } from "../../src/lib/dux";

/** 2024-06-03 04:00:00 America/New_York ≈ EDТ */
const DAY = "2024-06-03";

function etToMs(hour: number, minute: number): number {
  // Use explicit offset: 2024-06-03 is EDT (UTC-4)
  const pad = (n: number) => String(n).padStart(2, "0");
  return Date.parse(`${DAY}T${pad(hour)}:${pad(minute)}:00-04:00`);
}

function bar(t: number, price: number, v: number, wiggle = 0.01) {
  const o = price;
  const c = price * (1 + (Math.random() - 0.5) * wiggle * 0.1);
  const h = Math.max(o, c) * (1 + wiggle * 0.05);
  const l = Math.min(o, c) * (1 - wiggle * 0.05);
  return { resolution: "1m" as const, t, o, h, l, c, v };
}

function fillRange(
  startH: number,
  startM: number,
  endH: number,
  endM: number,
  priceFn: (i: number) => number,
  volFn: (i: number) => number
) {
  const out = [];
  let i = 0;
  for (let mins = startH * 60 + startM; mins < endH * 60 + endM; mins++) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    out.push(bar(etToMs(h, m), priceFn(i), volFn(i)));
    i++;
  }
  return out;
}

function writeFixture(name: string, body: unknown) {
  const dir = fixturesDir();
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${name}.json`);
  fs.writeFileSync(p, JSON.stringify(body, null, 2));
  console.log("Wrote", p);
}

// Prior close conceptually $2.00 → open $4.20 = +110%
const allow = {
  id: "FIX_ALLOW_STANDARD",
  symbol: "US.GUSALLOW",
  intent: "Open gap ≥100%, mid PM volume → standard GUS path allowed",
  meta: {
    floatShares: 8_000_000,
    mcapUsd: 40_000_000,
    sector: "Technology",
    isBiotech: false,
    isEnergy: false,
    isChinaAdr: false,
  },
  candles: [
    { resolution: "1d" as const, t: etToMs(16, 0) - 86_400_000, o: 1.9, h: 2.1, l: 1.8, c: 2.0, v: 2_000_000 },
    ...fillRange(4, 0, 9, 30, () => 3.8 + Math.random() * 0.2, () => 40_000), // ~13.2M PM shares
    ...fillRange(9, 30, 11, 30, (i) => 4.2 + Math.min(i, 40) * 0.01, () => 80_000),
    ...fillRange(11, 30, 16, 0, () => 4.5, () => 30_000),
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
    { resolution: "1d" as const, t: etToMs(16, 0) - 86_400_000, o: 1.5, h: 1.7, l: 1.4, c: 1.6, v: 5_000_000 },
    ...fillRange(4, 0, 9, 30, () => 3.5, () => 220_000), // ~72.6M PM
    ...fillRange(9, 30, 16, 0, () => 4.0, () => 100_000),
  ],
};

const nano = {
  id: "FIX_NANO_ROTATION",
  symbol: "US.GUSNANO",
  intent: "Float <2M and high PM rotation → pullback variant path",
  meta: {
    floatShares: 1_500_000,
    mcapUsd: 25_000_000,
    sector: "Healthcare",
    isBiotech: false,
    isEnergy: false,
    isChinaAdr: false,
  },
  candles: [
    { resolution: "1d" as const, t: etToMs(16, 0) - 86_400_000, o: 3.0, h: 3.2, l: 2.9, c: 3.1, v: 500_000 },
    ...fillRange(4, 0, 9, 30, () => 8.0, () => 80_000), // ~26M PM → rotation ~17x
    ...fillRange(9, 30, 16, 0, (i) => 10 - Math.min(i, 120) * 0.02, () => 50_000),
  ],
};

writeFixture("FIX_ALLOW_STANDARD", allow);
writeFixture("FIX_CROWDED_DENY", crowded);
writeFixture("FIX_NANO_ROTATION", nano);
