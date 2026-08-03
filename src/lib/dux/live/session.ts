import type { Trade } from "../backtest/types";
import { createBroker, type LiveBroker } from "./broker";
import { loadLiveConfig } from "./config";
import { evaluateIntent } from "./gates";
import { insertLiveRun, insertLiveTickets } from "./store";
import type { LiveConfig, LiveIntent, LiveSessionResult, LiveTicket } from "./types";

export function intentsFromTrades(trades: Trade[]): LiveIntent[] {
  const intents: LiveIntent[] = [];
  for (const trade of trades) {
    for (const leg of trade.legs) {
      intents.push({
        symbol: trade.symbol,
        side: leg.side,
        shares: leg.shares,
        price: leg.price,
        reason: leg.reason,
        t: leg.t,
      });
    }
  }
  return intents;
}

export async function runLiveSession(input: {
  intents: LiveIntent[];
  config?: Partial<LiveConfig>;
  broker?: LiveBroker;
  persist?: boolean;
  /** Override mock max_sell_short when using MockBroker via createBroker. */
  mockMaxSellShort?: number;
}): Promise<LiveSessionResult> {
  const cfg = loadLiveConfig(input.config ?? {});
  const broker = input.broker ?? createBroker(cfg, input.mockMaxSellShort ?? 50);
  const startedAt = Date.now();
  const tickets: LiveTicket[] = [];

  for (const intent of input.intents) {
    const decision = evaluateIntent(intent, cfg);

    if (cfg.kill) {
      tickets.push({
        intent,
        decision,
        maxSellShort: null,
        clampedShares: 0,
        status: "killed",
        brokerMsg: "DUX_LIVE_KILL",
        brokerOrderId: null,
      });
      continue;
    }

    if (!decision.ok) {
      tickets.push({
        intent,
        decision,
        maxSellShort: null,
        clampedShares: 0,
        status: "rejected",
        brokerMsg: decision.rejectReason ?? "rejected",
        brokerOrderId: null,
      });
      continue;
    }

    let maxSellShort: number | null = null;
    let clamped = decision.shares;
    try {
      if (intent.side === "short") {
        maxSellShort = await broker.getMaxSellShort(intent.symbol, intent.price);
        clamped = Math.min(clamped, Math.floor(maxSellShort));
      }
    } catch (e) {
      tickets.push({
        intent,
        decision,
        maxSellShort,
        clampedShares: 0,
        status: "error",
        brokerMsg: e instanceof Error ? e.message : String(e),
        brokerOrderId: null,
      });
      continue;
    }

    if (clamped <= 0) {
      tickets.push({
        intent,
        decision,
        maxSellShort,
        clampedShares: 0,
        status: "rejected",
        brokerMsg: "max_sell_short_zero",
        brokerOrderId: null,
      });
      continue;
    }

    if (decision.dryRun) {
      tickets.push({
        intent,
        decision,
        maxSellShort,
        clampedShares: clamped,
        status: "dry_run",
        brokerMsg: "dry_run_no_place",
        brokerOrderId: null,
      });
      continue;
    }

    // REAL requires arm (already in dryRun) — extra guard
    if (cfg.trdEnv === "REAL" && !cfg.armed) {
      tickets.push({
        intent,
        decision,
        maxSellShort,
        clampedShares: clamped,
        status: "rejected",
        brokerMsg: "real_requires_arm",
        brokerOrderId: null,
      });
      continue;
    }

    try {
      const placed = await broker.place(intent, clamped, cfg);
      tickets.push({
        intent,
        decision,
        maxSellShort,
        clampedShares: clamped,
        status: placed.ok ? "submitted" : "error",
        brokerMsg: placed.message,
        brokerOrderId: placed.orderId,
      });
    } catch (e) {
      tickets.push({
        intent,
        decision,
        maxSellShort,
        clampedShares: clamped,
        status: "error",
        brokerMsg: e instanceof Error ? e.message : String(e),
        brokerOrderId: null,
      });
    }
  }

  const submitted = tickets.filter((t) => t.status === "submitted").length;
  const dryRun = tickets.filter((t) => t.status === "dry_run").length;
  const rejected = tickets.filter((t) => t.status === "rejected" || t.status === "killed").length;

  let runId: number | null = null;
  if (input.persist !== false) {
    const status = cfg.kill ? "killed" : submitted > 0 ? "submitted" : dryRun > 0 ? "dry_run" : "ok";
    runId = insertLiveRun({
      broker: broker.kind,
      trdEnv: cfg.trdEnv,
      armed: cfg.armed,
      status,
      summaryJson: JSON.stringify({ submitted, dryRun, rejected, tickets: tickets.length }),
      startedAt,
      finishedAt: Date.now(),
    });
    insertLiveTickets(runId, tickets);
  }

  return { runId, config: cfg, tickets, submitted, dryRun, rejected };
}
