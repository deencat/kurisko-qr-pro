import { NextResponse } from "next/server";
import {
  getScanRunAt,
  listScanRuns,
  loadScanFeed,
} from "@/lib/kurisko/data/snapshot-store";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const atRaw = searchParams.get("at");
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));

    if (atRaw) {
      const at = Date.parse(atRaw);
      if (!Number.isFinite(at)) {
        return NextResponse.json({ error: "Invalid at timestamp" }, { status: 400 });
      }

      const run = getScanRunAt(at);
      if (!run) {
        return NextResponse.json({ error: "No scan run at or before requested time" }, { status: 404 });
      }

      const feed = loadScanFeed(run.id);
      if (!feed) {
        return NextResponse.json({ error: "Scan run data missing" }, { status: 404 });
      }

      return NextResponse.json({
        ...feed,
        replayMode: "snapshot" as const,
        requestedAt: at,
      });
    }

    const now = Date.now();
    const from = fromRaw ? Date.parse(fromRaw) : now - 24 * 60 * 60 * 1000;
    const to = toRaw ? Date.parse(toRaw) : now;

    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return NextResponse.json({ error: "Invalid from/to timestamp" }, { status: 400 });
    }

    const runs = listScanRuns(from, to, limit);
    return NextResponse.json({
      replayMode: "list" as const,
      from,
      to,
      runs,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "History scan query failed" },
      { status: 500 }
    );
  }
}
