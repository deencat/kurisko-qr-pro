import { NextResponse } from "next/server";
import { getDuxResearchStatus } from "@/lib/dux/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const status = getDuxResearchStatus();
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json(
      {
        error: "dux_status_failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
