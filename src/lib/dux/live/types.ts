export type LiveTrdEnv = "SIMULATE" | "REAL";
export type LiveBrokerKind = "mock" | "futu" | "webull";
export type LiveOrderStatus =
  | "dry_run"
  | "submitted"
  | "rejected"
  | "error"
  | "killed";

export interface LiveIntent {
  symbol: string;
  side: "short" | "cover";
  shares: number;
  price: number;
  reason: string;
  t: number;
}

export interface LiveGateDecision {
  ok: boolean;
  rejectReason?: string;
  shares: number;
  notional: number;
  dryRun: boolean;
}

export interface LiveTicket {
  intent: LiveIntent;
  decision: LiveGateDecision;
  maxSellShort: number | null;
  clampedShares: number;
  status: LiveOrderStatus;
  brokerMsg: string;
  brokerOrderId: string | null;
}

export interface LiveConfig {
  armed: boolean;
  trdEnv: LiveTrdEnv;
  maxShares: number;
  maxNotional: number;
  allowlist: string[];
  kill: boolean;
  broker: LiveBrokerKind;
  host: string;
  port: number;
}

export interface LiveSessionResult {
  runId: number | null;
  config: LiveConfig;
  tickets: LiveTicket[];
  submitted: number;
  dryRun: number;
  rejected: number;
}
