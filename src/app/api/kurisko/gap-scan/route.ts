import { NextResponse } from "next/server";
import { scanAzizSipCapital } from "@/lib/aziz/scan/capital-sip-scanner";
import { isAuthorizedCronRequest } from "@/lib/kurisko/snapshot/cron-auth";
import { getCachedGapScan } from "@/lib/kurisko/snapshot/scan-store";

/** Read-only cached gap scan — no Capital.com calls from clients. */
export async function GET() {
  const cached = getCachedGapScan();
  if (cached) return NextResponse.json(cached);

  return NextResponse.json(
    { error: "Gap scan warming up — wait for the server scheduler." },
    { status: 503 }
  );
}

/** Manual/cron trigger only. */
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { error: "Gap scan is server-side only. Use GET to read cached data." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const maxSymbols = body.maxSymbols != null ? Number(body.maxSymbols) : 12;

    const result = await scanAzizSipCapital({
      universe: "capital_gainers",
      maxSymbols,
      thresholds: {
        minGapPct: 0.5,
        minRvol: 1.0,
        minPriceUsd: 3,
        maxPriceUsd: 500,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gap scan failed" },
      { status: 500 }
    );
  }
}
