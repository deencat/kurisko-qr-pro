import { NextResponse } from "next/server";
import { fetchEconomicCalendar } from "@/lib/aziz/news/finnhub";
import type { KuriskoEconomicCalendar } from "@/lib/kurisko/snapshot/types";

/** Economic calendar for QR Pro — Finnhub when configured, else static fallback. */
export async function GET() {
  try {
    const calendar = await fetchEconomicCalendar({ daysAhead: 2 });
    const payload: KuriskoEconomicCalendar = {
      configured: calendar.configured,
      events: calendar.events,
      note: calendar.note,
    };
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        configured: false,
        events: [],
        note: error instanceof Error ? error.message : "Economic calendar failed",
      } satisfies KuriskoEconomicCalendar,
      { status: 200 }
    );
  }
}
