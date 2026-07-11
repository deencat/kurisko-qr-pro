import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/kurisko/snapshot/cron-auth";
import { KURISKO_DEFAULT_SCAN_SYMBOLS } from "@/lib/kurisko/snapshot/build-snapshot";
import { runKuriskoScan } from "@/lib/kurisko/snapshot/run-scheduled-scan";
import { getKuriskoScanFeed } from "@/lib/kurisko/snapshot/scan-store";

/** Manual/cron trigger only — clients must use GET for cached results. */
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      {
        error:
          "Scan triggers are server-side only. Use GET /api/kurisko/scan to read the latest cached scan.",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const timeframePairId = body.timeframePairId as string | undefined;
    const symbols: string[] | undefined =
      body.symbols != null
        ? String(body.symbols)
            .split(",")
            .map((s: string) => s.trim().toUpperCase())
            .filter(Boolean)
        : undefined;

    const result = await runKuriskoScan({
      symbols,
      timeframePairId,
      includeWidgets: body.includeWidgets !== false,
      includeLevels: body.includeLevels === true,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kurisko scan failed" },
      { status: 500 }
    );
  }
}

/** Read-only feed for all connected clients — no Capital.com calls. */
export async function GET() {
  const feed = getKuriskoScanFeed();

  if (!feed.results.length && !feed.scanning) {
    void runKuriskoScan({ includeWidgets: true, includeLevels: true }).catch((error) => {
      console.error("[kurisko-scan] bootstrap scan failed:", error);
    });

    return NextResponse.json(
      {
        ...getKuriskoScanFeed(),
        message: "Scan warming up — server scheduler will populate results shortly.",
        defaultSymbols: KURISKO_DEFAULT_SCAN_SYMBOLS,
      },
      { status: 202 }
    );
  }

  return NextResponse.json(feed);
}
