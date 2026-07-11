import { NextResponse } from "next/server";
import { countBuySell, getKuriskoAlerts } from "@/lib/kurisko/snapshot/alert-store";
import type { KuriskoAlertsResponse } from "@/lib/kurisko/snapshot/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(80, Math.max(1, Number(searchParams.get("limit") ?? 40)));

  const alerts = getKuriskoAlerts(limit);
  let buyCount = 0;
  let sellCount = 0;
  for (const a of alerts) {
    if (a.action === "BUY") buyCount++;
    else sellCount++;
  }

  const payload: KuriskoAlertsResponse = {
    alerts,
    buyCount,
    sellCount,
  };

  return NextResponse.json(payload);
}
