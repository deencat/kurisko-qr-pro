import "server-only";

import { stageRank } from "./k1-stage";
import { quadSnippet } from "./quad-depth";
import type { KuriskoAlert, KuriskoK1Stage, KuriskoSnapshot } from "./types";

const MAX_ALERTS = 80;

interface LastState {
  stage: KuriskoK1Stage;
  side: "long" | "short";
  ts: number;
}

const lastBySymbol = new Map<string, LastState>();
const alerts: KuriskoAlert[] = [];

function alertAction(side: "long" | "short", stage: KuriskoK1Stage): "BUY" | "SELL" | null {
  if (stage !== "CONFIRM" && stage !== "SIGNAL") return null;
  return side === "long" ? "BUY" : "SELL";
}

function formatMessage(snapshot: KuriskoSnapshot, from: KuriskoK1Stage, to: KuriskoK1Stage): string {
  const dir = snapshot.side.toUpperCase();
  const tf = snapshot.executionResolution;
  if (to === "SIGNAL") return `${snapshot.symbol} ${tf} SIGNAL ${dir}`;
  if (to === "CONFIRM") return `${snapshot.symbol} ${tf} CONFIRM ${dir}`;
  if (to === "DIV") return `${snapshot.symbol} ${tf} DIVERGENCE ${dir}`;
  if (to === "STAGE1") return `${snapshot.symbol} ${tf} STAGE1 ${dir} — track deepest`;
  if (to === "ARM") return `${snapshot.symbol} ${tf} ARMED ${dir} — quad in zone`;
  return `${snapshot.symbol} ${tf} ${from} → ${to}`;
}

/** Record stage transition and append live alert when stage advances. */
export function recordSnapshotTransition(snapshot: KuriskoSnapshot): KuriskoAlert | null {
  const key = snapshot.symbol;
  const prev = lastBySymbol.get(key);
  lastBySymbol.set(key, { stage: snapshot.stage, side: snapshot.side, ts: snapshot.scannedAt });

  if (!prev || prev.stage === snapshot.stage) return null;
  if (stageRank(snapshot.stage) <= stageRank(prev.stage)) return null;

  const action = alertAction(snapshot.side, snapshot.stage);
  const alert: KuriskoAlert = {
    id: `${key}-${snapshot.scannedAt}`,
    source: "k1",
    symbol: snapshot.symbol,
    timeframe: snapshot.executionResolution,
    side: snapshot.side,
    action: action ?? (snapshot.side === "long" ? "BUY" : "SELL"),
    fromStage: prev.stage,
    toStage: snapshot.stage,
    message: formatMessage(snapshot, prev.stage, snapshot.stage),
    quadSnippet: quadSnippet(snapshot.quadExec),
    price: snapshot.price,
    ts: snapshot.scannedAt,
  };

  alerts.unshift(alert);
  if (alerts.length > MAX_ALERTS) alerts.length = MAX_ALERTS;
  return alert;
}

export function getKuriskoAlerts(limit = 40): KuriskoAlert[] {
  return alerts.slice(0, limit);
}

/** Ingest TradingView webhook alert (instant on VPS). */
export function recordTradingViewAlert(params: {
  symbol: string;
  price: number;
  timeframe: string;
  action: "BUY" | "SELL";
  message: string;
}): KuriskoAlert {
  const ts = Date.now();
  const side = params.action === "BUY" ? "long" : "short";
  const alert: KuriskoAlert = {
    id: `tv-${params.symbol}-${ts}`,
    source: "tradingview",
    symbol: params.symbol,
    timeframe: params.timeframe,
    side,
    action: params.action,
    fromStage: "WATCHING",
    toStage: "SIGNAL",
    message: params.message,
    quadSnippet: "TradingView",
    price: params.price,
    ts,
  };
  alerts.unshift(alert);
  if (alerts.length > MAX_ALERTS) alerts.length = MAX_ALERTS;
  return alert;
}

export function countBuySell(snapshots: KuriskoSnapshot[]): { buyCount: number; sellCount: number } {
  let buyCount = 0;
  let sellCount = 0;
  for (const s of snapshots) {
    if (s.stage === "SIGNAL" || s.stage === "CONFIRM") {
      if (s.side === "long") buyCount++;
      else sellCount++;
    }
  }
  return { buyCount, sellCount };
}
