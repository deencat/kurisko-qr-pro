import { NextResponse } from "next/server";
import type { KuriskoFearGreed } from "@/lib/kurisko/snapshot/types";

const CACHE_MS = 15 * 60 * 1000;
let cache: { data: KuriskoFearGreed; at: number } | null = null;

/** Crypto Fear & Greed index with prev / 1W / 1M history. */
export async function GET() {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json(cache.data);
    }

    const res = await fetch("https://api.alternative.me/fng/?limit=31", {
      next: { revalidate: 900 },
    });

    if (!res.ok) {
      throw new Error(`Fear & Greed HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      data?: Array<{ value: string; value_classification: string; timestamp: string }>;
    };

    const rows = json.data ?? [];
    const row = rows[0];
    if (!row) throw new Error("No Fear & Greed data");

    const data: KuriskoFearGreed = {
      value: Number(row.value),
      classification: row.value_classification,
      timestamp: Number(row.timestamp) * 1000,
      source: "alternative.me",
      prev: rows[1] ? Number(rows[1].value) : undefined,
      weekAgo: rows[7] ? Number(rows[7].value) : undefined,
      monthAgo: rows[30] ? Number(rows[30].value) : undefined,
    };

    cache = { data, at: Date.now() };
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        value: 50,
        classification: "Neutral",
        timestamp: Date.now(),
        source: "fallback",
        error: error instanceof Error ? error.message : "Fear & Greed unavailable",
      },
      { status: 200 }
    );
  }
}
