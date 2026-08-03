import type { LiveConfig, LiveGateDecision, LiveIntent } from "./types";

export function evaluateIntent(intent: LiveIntent, cfg: LiveConfig): LiveGateDecision {
  if (cfg.kill) {
    return {
      ok: false,
      rejectReason: "killed",
      shares: 0,
      notional: 0,
      dryRun: true,
    };
  }

  if (cfg.allowlist.length === 0 || !cfg.allowlist.includes(intent.symbol)) {
    return {
      ok: false,
      rejectReason: "not_allowlisted",
      shares: 0,
      notional: 0,
      dryRun: true,
    };
  }

  let shares = Math.floor(intent.shares);
  if (shares <= 0) {
    return {
      ok: false,
      rejectReason: "zero_shares",
      shares: 0,
      notional: 0,
      dryRun: true,
    };
  }

  if (shares > cfg.maxShares) shares = cfg.maxShares;

  let notional = shares * intent.price;
  if (notional > cfg.maxNotional) {
    shares = Math.floor(cfg.maxNotional / intent.price);
    notional = shares * intent.price;
  }

  if (shares <= 0) {
    return {
      ok: false,
      rejectReason: "max_notional",
      shares: 0,
      notional: 0,
      dryRun: true,
    };
  }

  // Place only when armed. REAL always requires arm; SIMULATE also requires arm to place.
  const dryRun = !cfg.armed;

  return { ok: true, shares, notional, dryRun };
}
