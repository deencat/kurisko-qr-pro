import { NextResponse } from "next/server";
import { queryAlerts } from "@/lib/kurisko/data/alert-store-persist";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    const symbol = searchParams.get("symbol") ?? undefined;
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));

    const fromTs = fromRaw ? Date.parse(fromRaw) : undefined;
    const toTs = toRaw ? Date.parse(toRaw) : undefined;

    if ((fromRaw && !Number.isFinite(fromTs)) || (toRaw && !Number.isFinite(toTs))) {
      return NextResponse.json({ error: "Invalid from/to timestamp" }, { status: 400 });
    }

    const alerts = queryAlerts({ fromTs, toTs, symbol, limit });

    let buyCount = 0;
    let sellCount = 0;
    for (const a of alerts) {
      if (a.action === "BUY") buyCount++;
      else sellCount++;
    }

    return NextResponse.json({
      replayMode: "alerts" as const,
      alerts,
      buyCount,
      sellCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "History alerts query failed" },
      { status: 500 }
    );
  }
}
