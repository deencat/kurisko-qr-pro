/**
 * Import synthetic FIX_* fixtures into the Dux SQLite store (no OpenD required).
 */
import fs from "node:fs";
import path from "node:path";
import {
  closeDuxDb,
  fixturesDir,
  logIngest,
  makeCandle,
  openDuxDb,
  upsertCandles,
  upsertSymbolMeta,
} from "../../src/lib/dux";

interface FixtureFile {
  id: string;
  symbol: string;
  intent: string;
  meta?: {
    floatShares?: number;
    mcapUsd?: number;
    sector?: string;
    isBiotech?: boolean;
    isEnergy?: boolean;
    isChinaAdr?: boolean;
  };
  candles: {
    resolution: "1m" | "1d";
    t: number;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  }[];
}

function main() {
  const dir = fixturesDir();
  fs.mkdirSync(dir, { recursive: true });
  const db = openDuxDb();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (!files.length) {
    console.error(`No fixtures in ${dir}. Generate with: npx tsx scripts/dux/generate-fixtures.ts`);
    process.exit(1);
  }

  let total = 0;
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as FixtureFile;
    const candles = raw.candles.map((c) =>
      makeCandle({
        symbol: raw.symbol,
        resolution: c.resolution,
        t: c.t,
        o: c.o,
        h: c.h,
        l: c.l,
        c: c.c,
        v: c.v,
        source: `fixture:${raw.id}`,
      })
    );
    upsertCandles(candles, db);
    if (raw.meta) {
      upsertSymbolMeta(
        {
          symbol: raw.symbol,
          floatShares: raw.meta.floatShares ?? null,
          mcapUsd: raw.meta.mcapUsd ?? null,
          sector: raw.meta.sector ?? null,
          isBiotech: Boolean(raw.meta.isBiotech),
          isEnergy: Boolean(raw.meta.isEnergy),
          isChinaAdr: Boolean(raw.meta.isChinaAdr),
          asOf: Date.now(),
          source: `fixture:${raw.id}`,
        },
        db
      );
    }
    logIngest(
      {
        symbol: raw.symbol,
        resolution: "1m",
        startDate: raw.id,
        endDate: raw.id,
        bars: candles.length,
        status: "ok",
        message: `fixture ${raw.id}: ${raw.intent}`,
        at: Date.now(),
      },
      db
    );
    total += candles.length;
    console.log(`Imported ${raw.id} (${raw.symbol}) bars=${candles.length}`);
  }
  closeDuxDb();
  console.log(`Done. total bars upserted=${total}`);
}

main();
