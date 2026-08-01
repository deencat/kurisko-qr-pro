import { NextResponse } from "next/server";
import type { CandleResolution } from "@/lib/lighter/client";
import { backfillSymbolCandles } from "@/lib/kurisko/data/backfill-service";
import { getCandleRange } from "@/lib/kurisko/data/candle-store";
import { isKuriskoDataEnabled } from "@/lib/kurisko/data/config";

const VALID_RESOLUTIONS = new Set<string>(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);

export async function GET(request: Request) {
  try {
    if (!isKuriskoDataEnabled()) {
      return NextResponse.json({ error: "Data persistence is disabled" }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get("symbol") ?? "US500").toUpperCase();
    const resolution = (searchParams.get("resolution") ?? "1m") as CandleResolution;
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    const backfill = searchParams.get("backfill") === "1";

    if (!VALID_RESOLUTIONS.has(resolution)) {
      return NextResponse.json({ error: "Invalid resolution" }, { status: 400 });
    }

    const now = Date.now();
    const from = fromRaw ? Date.parse(fromRaw) : now - 24 * 60 * 60 * 1000;
    const to = toRaw ? Date.parse(toRaw) : now;

    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return NextResponse.json({ error: "Invalid from/to timestamp" }, { status: 400 });
    }

    if (backfill) {
      await backfillSymbolCandles(symbol, resolution, { endTs: to });
    }

    const candles = getCandleRange(symbol, resolution, from, to);

    return NextResponse.json({
      replayMode: "candles" as const,
      symbol,
      resolution,
      from,
      to,
      count: candles.length,
      candles: candles.map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "History candles query failed" },
      { status: 500 }
    );
  }
}
