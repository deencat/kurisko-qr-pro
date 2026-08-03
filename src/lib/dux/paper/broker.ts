import type { FillLeg } from "../backtest/types";
import type { PaperOrder } from "./types";

/** Shadow broker: records fills; never talks to a real exchange. */
export class PaperBroker {
  readonly orders: PaperOrder[] = [];

  short(input: {
    symbol: string;
    t: number;
    shares: number;
    price: number;
    reason: string;
  }): void {
    this.orders.push({ ...input, side: "short" });
  }

  cover(input: {
    symbol: string;
    t: number;
    shares: number;
    price: number;
    reason: string;
  }): void {
    this.orders.push({ ...input, side: "cover" });
  }

  /** Mirror legs from a completed Trade into the journal. */
  ingestTradeLegs(symbol: string, legs: FillLeg[]): void {
    for (const leg of legs) {
      this.orders.push({
        symbol,
        t: leg.t,
        side: leg.side,
        shares: leg.shares,
        price: leg.price,
        reason: leg.reason,
      });
    }
  }
}
