import { NextResponse } from "next/server";
import { buildKuriskoSnapshot } from "@/lib/kurisko/snapshot/build-snapshot";
import { recordSnapshotTransition } from "@/lib/kurisko/snapshot/alert-store";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get("symbol") ?? "US500").toUpperCase();
    const timeframePairId = searchParams.get("timeframePairId") ?? undefined;
    const dataSource = searchParams.get("dataSource") ?? "capital";

    if (dataSource !== "capital") {
      return NextResponse.json({ error: "Kurisko scanner uses Capital.com data only" }, { status: 400 });
    }

    const snapshot = await buildKuriskoSnapshot({ symbol, timeframePairId });
    recordSnapshotTransition(snapshot);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kurisko snapshot failed" },
      { status: 500 }
    );
  }
}
