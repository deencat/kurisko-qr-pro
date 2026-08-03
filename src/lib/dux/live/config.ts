import { FUTU_DEFAULT_HOST, FUTU_DEFAULT_PORT } from "../config";
import type { LiveBrokerKind, LiveConfig, LiveTrdEnv } from "./types";

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

export function loadLiveConfig(overrides: Partial<LiveConfig> = {}): LiveConfig {
  const allowRaw = process.env.DUX_SYMBOL_ALLOWLIST?.trim() ?? "";
  const allowlist = allowRaw
    ? allowRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const trdEnv = (process.env.DUX_TRD_ENV?.trim().toUpperCase() === "REAL"
    ? "REAL"
    : "SIMULATE") as LiveTrdEnv;
  const broker = (process.env.DUX_BROKER?.trim().toLowerCase() || "mock") as LiveBrokerKind;
  return {
    armed: truthy(process.env.DUX_LIVE_ARMED),
    trdEnv,
    maxShares: Number(process.env.DUX_MAX_SHARES ?? 100),
    maxNotional: Number(process.env.DUX_MAX_NOTIONAL ?? 2000),
    allowlist,
    kill: truthy(process.env.DUX_LIVE_KILL),
    broker: broker === "futu" || broker === "webull" ? broker : "mock",
    host: process.env.FUTU_OPEND_HOST?.trim() || FUTU_DEFAULT_HOST,
    port: Number(process.env.FUTU_OPEND_PORT ?? FUTU_DEFAULT_PORT),
    ...overrides,
  };
}
