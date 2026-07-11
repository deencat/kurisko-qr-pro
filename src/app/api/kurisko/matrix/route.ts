import { NextResponse } from "next/server";
import { buildKuriskoMatrix } from "@/lib/kurisko/snapshot/build-matrix";
import { isAuthorizedCronRequest } from "@/lib/kurisko/snapshot/cron-auth";
import { getCachedMatrix } from "@/lib/kurisko/snapshot/scan-store";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get("symbol") ?? "US500").toUpperCase();

    const cached = getCachedMatrix(symbol);
    if (cached) return NextResponse.json(cached);

    return NextResponse.json(
      {
        error: `Matrix for ${symbol} not ready yet. Wait for the server scan cycle.`,
      },
      { status: 503 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kurisko matrix failed" },
      { status: 500 }
    );
  }
}

/** Manual refresh only — blocked for browser clients. */
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { error: "Matrix refresh is server-side only. Use GET to read cached data." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const symbol = String(body.symbol ?? "US500").toUpperCase();
    const matrix = await buildKuriskoMatrix(symbol);
    return NextResponse.json(matrix);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kurisko matrix failed" },
      { status: 500 }
    );
  }
}
