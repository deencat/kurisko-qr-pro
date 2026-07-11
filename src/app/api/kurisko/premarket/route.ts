import { NextResponse } from "next/server";
import { scanAzizSipCapital } from "@/lib/aziz/scan/capital-sip-scanner";
import { isAuthorizedCronRequest } from "@/lib/kurisko/snapshot/cron-auth";
import { getCachedPremarket } from "@/lib/kurisko/snapshot/scan-store";

/** Read-only cached pre-market scan — no Capital.com calls from clients. */
export async function GET() {
  const cached = getCachedPremarket();
  if (cached) return NextResponse.json(cached);

  return NextResponse.json(
    { error: "Pre-market scan warming up — wait for the server scheduler." },
    { status: 503 }
  );
}

/** Manual/cron trigger only. */
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { error: "Pre-market scan is server-side only. Use GET to read cached data." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const maxSymbols = body.maxSymbols != null ? Number(body.maxSymbols) : 10;

    const result = await scanAzizSipCapital({
      universe: "capital_volatile",
      maxSymbols,
      thresholds: {
        minGapPct: 0.3,
        minRvol: 0.8,
        minPriceUsd: 3,
        maxPriceUsd: 500,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pre-market scan failed" },
      { status: 500 }
    );
  }
}
