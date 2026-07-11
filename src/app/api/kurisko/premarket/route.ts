import { NextResponse } from "next/server";
import { scanAzizSipCapital } from "@/lib/aziz/scan/capital-sip-scanner";

/** Pre-market poppers — Capital volatile movers + SIP scoring. */
export async function POST(request: Request) {
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

export async function GET() {
  return NextResponse.json({
    description: "QR Pro pre-market — POST { maxSymbols?: 10 }",
    universe: "capital_volatile",
  });
}
