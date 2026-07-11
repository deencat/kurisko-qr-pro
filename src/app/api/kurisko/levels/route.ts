import { NextResponse } from "next/server";
import { buildAllSymbolLevels } from "@/lib/kurisko/snapshot/build-levels";
import { KURISKO_DEFAULT_SCAN_SYMBOLS } from "@/lib/kurisko/snapshot/build-snapshot";
import { isAuthorizedCronRequest } from "@/lib/kurisko/snapshot/cron-auth";
import { getCachedLevels } from "@/lib/kurisko/snapshot/scan-store";
import type { KuriskoLevelsResponse } from "@/lib/kurisko/snapshot/types";

export async function GET(request: Request) {
  const cached = getCachedLevels();
  if (cached) return NextResponse.json(cached);

  return NextResponse.json(
    {
      error: "Key levels not ready yet. Wait for the server scan cycle.",
      defaultSymbols: KURISKO_DEFAULT_SCAN_SYMBOLS,
    },
    { status: 503 }
  );
}

/** Manual refresh only — blocked for browser clients. */
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { error: "Levels refresh is server-side only. Use GET to read cached data." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const raw = body.symbols as string | undefined;
    const symbols = raw
      ? raw.split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean)
      : [...KURISKO_DEFAULT_SCAN_SYMBOLS];

    const levels = await buildAllSymbolLevels(symbols);
    const payload: KuriskoLevelsResponse = { scannedAt: Date.now(), symbols: levels };
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Levels failed" },
      { status: 500 }
    );
  }
}
