import { NextResponse } from "next/server";
import { capitalEnvironment, isCapitalConfigured, pingCapital } from "@/lib/capital/client";

export async function GET() {
  try {
    if (!isCapitalConfigured()) {
      return NextResponse.json({
        configured: false,
        environment: capitalEnvironment(),
        message: "Set CAPITAL_API_KEY, CAPITAL_IDENTIFIER, CAPITAL_API_PASSWORD in .env",
      });
    }

    const ping = await pingCapital();
    return NextResponse.json({
      configured: true,
      environment: ping.environment,
      serverTime: ping.serverTime,
      ok: ping.ok,
    });
  } catch (error) {
    return NextResponse.json(
      {
        configured: isCapitalConfigured(),
        environment: capitalEnvironment(),
        ok: false,
        error: error instanceof Error ? error.message : "Capital.com connection failed",
      },
      { status: 500 }
    );
  }
}
