import { NextResponse } from "next/server";
import {
  buildKuriskoSnapshot,
  KURISKO_DEFAULT_SCAN_SYMBOLS,
} from "@/lib/kurisko/snapshot/build-snapshot";
import { countBuySell, getKuriskoAlerts, recordSnapshotTransition } from "@/lib/kurisko/snapshot/alert-store";
import type { KuriskoScanResult } from "@/lib/kurisko/snapshot/types";

const SCAN_SYMBOL_DELAY_MS = 1200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const timeframePairId = body.timeframePairId as string | undefined;
    const symbols: string[] =
      body.symbols != null
        ? String(body.symbols)
            .split(",")
            .map((s: string) => s.trim().toUpperCase())
            .filter(Boolean)
        : [...KURISKO_DEFAULT_SCAN_SYMBOLS];

    const results = [];
    const errors: { symbol: string; error: string }[] = [];

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i]!;
      if (i > 0) await sleep(SCAN_SYMBOL_DELAY_MS);
      try {
        const snapshot = await buildKuriskoSnapshot({ symbol, timeframePairId });
        recordSnapshotTransition(snapshot);
        results.push(snapshot);
      } catch (e) {
        errors.push({
          symbol,
          error: e instanceof Error ? e.message : "Snapshot failed",
        });
      }
    }

    const { buyCount, sellCount } = countBuySell(results);

    const payload: KuriskoScanResult = {
      scannedAt: Date.now(),
      symbols,
      results,
      buyCount,
      sellCount,
      ...(errors.length ? { errors } : {}),
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kurisko scan failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const alerts = getKuriskoAlerts(5);
  return NextResponse.json({
    description:
      "Kurisko QR Pro scanner — POST { symbols?: 'US500,US100,GOLD,BTCUSD,US30', timeframePairId?: '1m+5m' }",
    defaultSymbols: KURISKO_DEFAULT_SCAN_SYMBOLS,
    recentAlerts: alerts.length,
  });
}
