import { NextResponse } from "next/server";
import { recordTradingViewAlert } from "@/lib/kurisko/snapshot/alert-store";
import {
  normalizeTradingViewSymbol,
  parseTradingViewAction,
  parseTradingViewTimeframe,
} from "@/lib/kurisko/snapshot/tradingview-webhook";

/** TradingView alert webhook — POST JSON from alert message template. */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = process.env.TV_WEBHOOK_SECRET?.trim();
    if (secret) {
      const provided = searchParams.get("secret") ?? request.headers.get("x-tv-secret");
      if (provided !== secret) {
        return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const ticker = String(body.ticker ?? body.symbol ?? "").trim();
    if (!ticker) {
      return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
    }

    const symbol = normalizeTradingViewSymbol(ticker);
    const price = Number(body.close ?? body.price ?? 0);
    const message = String(body.message ?? body.msg ?? "TradingView alert");
    const action = parseTradingViewAction(body.action ?? body.side, message);
    const timeframe = parseTradingViewTimeframe(body.interval ?? body.timeframe);

    const alert = recordTradingViewAlert({
      symbol,
      price: Number.isFinite(price) ? price : 0,
      timeframe,
      action,
      message,
    });

    return NextResponse.json({ ok: true, alert });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    description: "TradingView webhook — POST JSON { ticker, close, interval, message, action? }",
    exampleUrl: "/api/kurisko/tradingview-webhook?secret=YOUR_TV_WEBHOOK_SECRET",
    messageTemplate: {
      ticker: "{{ticker}}",
      close: "{{close}}",
      interval: "{{interval}}",
      message: "{{message}}",
      action: "{{strategy.order.action}}",
    },
  });
}
