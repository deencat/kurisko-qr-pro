import { NextResponse } from "next/server";
import {
  getAdjacentScanRun,
  getScanRunById,
  loadScanFeed,
} from "@/lib/kurisko/data/snapshot-store";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const adjacent = searchParams.get("adjacent");

    const run = getScanRunById(id);
    if (!run) {
      return NextResponse.json({ error: "Scan run not found" }, { status: 404 });
    }

    if (adjacent === "prev" || adjacent === "next") {
      const neighbor = getAdjacentScanRun(id, adjacent);
      if (!neighbor) {
        return NextResponse.json({ error: `No ${adjacent} scan run` }, { status: 404 });
      }
      const feed = loadScanFeed(neighbor.id);
      if (!feed) {
        return NextResponse.json({ error: "Adjacent scan run data missing" }, { status: 404 });
      }
      return NextResponse.json({ ...feed, replayMode: "snapshot" as const });
    }

    const feed = loadScanFeed(id);
    if (!feed) {
      return NextResponse.json({ error: "Scan run data missing" }, { status: 404 });
    }

    return NextResponse.json({ ...feed, replayMode: "snapshot" as const });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "History scan load failed" },
      { status: 500 }
    );
  }
}
