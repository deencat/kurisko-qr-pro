import { NextResponse } from "next/server";
import { scanAzizSipCapital } from "@/lib/aziz/scan/capital-sip-scanner";

/** Gap scanner — Capital gainers + SIP scoring (proxied for QR Pro public route). */
export async function POST(request: Request) {
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

export async function GET() {
  return NextResponse.json({
    description: "QR Pro gap scanner — POST { maxSymbols?: 12 }",
    universe: "capital_gainers",
  });
}
