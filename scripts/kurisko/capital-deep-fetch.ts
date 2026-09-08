/**
 * Fetch-only Capital 1m deep history (extends gitignored cache). No backtest engine.
 *
 *   npx tsx --import ./scripts/kurisko/stub-server-only.mjs scripts/kurisko/capital-deep-fetch.ts --symbol US100 --from 2024-09-01 --to 2026-09-07 --max-pages 1000
 */
import { loadCapitalEnv } from "./load-env";
import { DEEP_MAX_PAGES, fetchCapital1mRange, isCapitalConfigured } from "./capital-fetch";

loadCapitalEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!isCapitalConfigured()) {
    throw new Error("Capital credentials missing");
  }
  const symbol = (arg("--symbol") ?? "US100").toUpperCase();
  const to = Date.parse(arg("--to") ?? new Date().toISOString());
  const from = Date.parse(arg("--from") ?? new Date(to - 540 * 86400_000).toISOString());
  const maxPages = Number(arg("--max-pages") ?? String(DEEP_MAX_PAGES));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    throw new Error("Invalid --from/--to");
  }
  console.log(
    `Deep fetch ${symbol} ${new Date(from).toISOString()} → ${new Date(to).toISOString()} maxPages=${maxPages}`
  );
  const r = await fetchCapital1mRange({
    symbol,
    startTimestamp: from,
    endTimestamp: to,
    maxPages: Number.isFinite(maxPages) ? maxPages : DEEP_MAX_PAGES,
    useCache: true,
    onProgress: (m) => console.log(m),
  });
  console.log(
    JSON.stringify(
      {
        symbol,
        epic: r.epic,
        bars: r.candles.length,
        pages: r.pages,
        fromCache: r.fromCache,
        cacheHitBars: r.cacheHitBars,
        first: r.candles[0] ? new Date(r.candles[0].t).toISOString() : null,
        last: r.candles.length ? new Date(r.candles[r.candles.length - 1]!.t).toISOString() : null,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
