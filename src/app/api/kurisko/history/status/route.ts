import { NextResponse } from "next/server";
import { getKuriskoHistoryStatus } from "@/lib/kurisko/data/history-status";

export async function GET() {
  return NextResponse.json(getKuriskoHistoryStatus());
}
