import { spawnSync } from "node:child_process";
import path from "node:path";
import type { LiveConfig, LiveIntent } from "./types";

export interface BrokerPlaceResult {
  ok: boolean;
  orderId: string | null;
  message: string;
  maxSellShort?: number;
}

export interface LiveBroker {
  readonly kind: string;
  getMaxSellShort(symbol: string, price: number): Promise<number>;
  place(intent: LiveIntent, shares: number, cfg: LiveConfig): Promise<BrokerPlaceResult>;
}

/** Deterministic broker for smoke tests (no OpenD). */
export class MockBroker implements LiveBroker {
  readonly kind = "mock";
  constructor(public maxSellShort = 50) {}

  async getMaxSellShort(_symbol: string, _price: number): Promise<number> {
    return this.maxSellShort;
  }

  async place(intent: LiveIntent, shares: number, cfg: LiveConfig): Promise<BrokerPlaceResult> {
    return {
      ok: true,
      orderId: `MOCK-${intent.side}-${shares}-${cfg.trdEnv}`,
      message: "mock submitted",
      maxSellShort: this.maxSellShort,
    };
  }
}

export class WebullBroker implements LiveBroker {
  readonly kind = "webull";
  async getMaxSellShort(): Promise<number> {
    throw new Error("WEBULL_NOT_IMPLEMENTED");
  }
  async place(): Promise<BrokerPlaceResult> {
    throw new Error("WEBULL_NOT_IMPLEMENTED");
  }
}

function bridgePath(): string {
  return path.join(process.cwd(), "scripts", "dux", "futu_trade_bridge.py");
}

function pythonBin(): string {
  return (
    process.env.DUX_PYTHON?.trim() ||
    path.join(process.cwd(), "scripts", "dux", ".venv", "bin", "python")
  );
}

/** Spawns futu_trade_bridge.py for max qty / place_order. */
export class FutuBroker implements LiveBroker {
  readonly kind = "futu";

  async getMaxSellShort(symbol: string, price: number): Promise<number> {
    const out = this.rpc({
      action: "max_sell_short",
      symbol,
      price,
    });
    if (!out.ok) throw new Error(out.message || "max_sell_short failed");
    return Number(out.max_sell_short ?? 0);
  }

  async place(intent: LiveIntent, shares: number, cfg: LiveConfig): Promise<BrokerPlaceResult> {
    const out = this.rpc({
      action: "place",
      symbol: intent.symbol,
      price: intent.price,
      qty: shares,
      side: intent.side,
      trd_env: cfg.trdEnv,
      host: cfg.host,
      port: cfg.port,
    });
    return {
      ok: Boolean(out.ok),
      orderId: out.order_id != null ? String(out.order_id) : null,
      message: String(out.message ?? ""),
      maxSellShort: out.max_sell_short != null ? Number(out.max_sell_short) : undefined,
    };
  }

  private rpc(payload: Record<string, unknown>): {
    ok: boolean;
    message?: string;
    max_sell_short?: number;
    order_id?: string | number;
  } {
    const py = pythonBin();
    const res = spawnSync(py, [bridgePath()], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, FUTU_OPEND_HOST: String(payload.host ?? process.env.FUTU_OPEND_HOST ?? ""), FUTU_OPEND_PORT: String(payload.port ?? process.env.FUTU_OPEND_PORT ?? "") },
    });
    if (res.error) {
      return { ok: false, message: res.error.message };
    }
    if (res.status !== 0) {
      return { ok: false, message: res.stderr || res.stdout || `exit ${res.status}` };
    }
    try {
      return JSON.parse(res.stdout.trim()) as {
        ok: boolean;
        message?: string;
        max_sell_short?: number;
        order_id?: string | number;
      };
    } catch {
      return { ok: false, message: `invalid bridge json: ${res.stdout}` };
    }
  }
}

export function createBroker(cfg: LiveConfig, mockMax = 50): LiveBroker {
  if (cfg.broker === "futu") return new FutuBroker();
  if (cfg.broker === "webull") return new WebullBroker();
  return new MockBroker(mockMax);
}
