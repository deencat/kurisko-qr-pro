import { NextResponse } from "next/server";
import { backfillAllScanSymbols } from "@/lib/kurisko/data/backfill-service";
import { isKuriskoDataEnabled } from "@/lib/kurisko/data/config";
import { runRetentionPrune } from "@/lib/kurisko/data/retention-service";
import { isAuthorizedCronRequest } from "@/lib/kurisko/snapshot/cron-auth";

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (!isKuriskoDataEnabled()) {
    return NextResponse.json({ error: "Data persistence is disabled" }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const cold = body.cold === true;
    const prune = body.prune === true;

    const backfill = await backfillAllScanSymbols({ cold });
    const retention = prune ? runRetentionPrune() : null;

    return NextResponse.json({
      ok: true,
      backfill,
      retention,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Backfill failed" },
      { status: 500 }
    );
  }
}
