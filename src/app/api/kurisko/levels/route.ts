import { NextResponse } from "next/server";
import { buildAllSymbolLevels } from "@/lib/kurisko/snapshot/build-levels";
import { KURISKO_DEFAULT_SCAN_SYMBOLS } from "@/lib/kurisko/snapshot/build-snapshot";
import type { KuriskoLevelsResponse } from "@/lib/kurisko/snapshot/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("symbols");
    const symbols = raw
      ? raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
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
