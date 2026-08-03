import type { GusParams } from "../types";

export const DEFAULT_EQUITY = 100_000;

/** Adverse short fill: pay up by slip + half-spread. */
export function shortFillPrice(rawOpen: number, params: GusParams): number {
  const bps = params.slippage_bps + params.spread_bps / 2;
  return rawOpen * (1 + bps / 10_000);
}

/** Cover fill: pay down (worse for short) by slip + half-spread. */
export function coverFillPrice(rawOpen: number, params: GusParams): number {
  const bps = params.slippage_bps + params.spread_bps / 2;
  return rawOpen * (1 - bps / 10_000);
}

export function computeShareSize(input: {
  params: GusParams;
  equity: number;
  sizeMult: number;
  entryPrice: number;
  stopPrice: number;
  floatShares: number | null;
  eDayVol: number;
}): number {
  const { params, equity, sizeMult, entryPrice, stopPrice, floatShares, eDayVol } = input;
  const riskPerShare = Math.abs(stopPrice - entryPrice);
  if (riskPerShare <= 0 || entryPrice <= 0) return 0;

  const riskBudget = equity * params.base_risk_pct * sizeMult;
  let shares = Math.floor(riskBudget / riskPerShare);

  if (floatShares != null && floatShares > 0) {
    shares = Math.min(shares, Math.floor(floatShares * params.float_cap_pct));
  }
  if (eDayVol > 0) {
    shares = Math.min(shares, Math.floor(eDayVol * params.vol_cap_pct));
  }
  return Math.max(0, shares);
}

/** Borrow fee for held shares (simple day fraction). */
export function borrowCost(shares: number, avgPrice: number, params: GusParams, holdDays = 1): number {
  if (params.borrow_fee_apr <= 0) return 0;
  return shares * avgPrice * params.borrow_fee_apr * (holdDays / 365);
}
