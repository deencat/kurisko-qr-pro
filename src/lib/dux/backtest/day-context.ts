import type { DuxCandle, DuxSymbolMeta, GusParams } from "../types";
import { etDayKey } from "./clock";
import type { DayContext, GusEvent, SkipReason } from "./types";

function gapPct(price: number, priorClose: number): number {
  if (priorClose <= 0) return 0;
  return (price - priorClose) / priorClose;
}

function floatBucket(floatShares: number | null): string {
  if (floatShares == null) return "10_20";
  const m = floatShares;
  if (m < 2e6) return "lt2";
  if (m < 5e6) return "2_5";
  if (m < 10e6) return "5_10";
  if (m < 20e6) return "10_20";
  return "20_50";
}

function gapPasses(params: GusParams, gapOpen: number, gapPm: number): boolean {
  switch (params.gap_ref) {
    case "open":
      return gapOpen >= params.gap_min;
    case "pm_last":
      return gapPm >= params.gap_min;
    case "pm_high":
      return gapPm >= params.gap_min; // caller passes gapPmHigh as gapPm when needed
    case "open_and_pm_last":
      return gapOpen >= params.gap_min && gapPm >= params.gap_min;
    default:
      return gapOpen >= params.gap_min;
  }
}

export function buildDayContext(input: {
  symbol: string;
  params: GusParams;
  bars1m: DuxCandle[];
  priorDaily: DuxCandle | null;
  meta: DuxSymbolMeta | null;
}): DayContext {
  const { symbol, params, bars1m, priorDaily, meta } = input;
  const journal: GusEvent[] = [];
  const pm = bars1m.filter((b) => b.session === "pm");
  const rth = bars1m.filter((b) => b.session === "rth");
  const dayKey = rth[0] ? etDayKey(rth[0].t) : pm[0] ? etDayKey(pm[0].t) : "unknown";

  const priorClose = priorDaily?.c ?? 0;
  const rthOpen = rth[0]?.o ?? 0;
  const pmLast = pm.length ? pm[pm.length - 1]!.c : rthOpen;
  const pmHigh = pm.length ? Math.max(...pm.map((b) => b.h)) : rthOpen;
  const pmVolume = pm.reduce((s, b) => s + b.v, 0);
  const pmVolumeM = pmVolume / 1e6;
  const gapOpenPct = gapPct(rthOpen, priorClose);
  const gapPmPct = gapPct(pmLast, priorClose);
  const gapPmHighPct = gapPct(pmHigh, priorClose);
  const eDayVol = pmVolume * params.K;

  const floatShares = meta?.floatShares ?? null;
  const mcapUsd = meta?.mcapUsd ?? null;
  const floatRotation = floatShares && floatShares > 0 ? pmVolume / floatShares : null;

  const priceRef = params.price_ref === "open" ? rthOpen : priorClose;
  const mcapRefPrice = params.mcap_price_ref === "open" ? rthOpen : priorClose;
  // mcap from meta is authoritative; if missing estimate from float * price
  const effectiveMcap =
    mcapUsd ?? (floatShares != null && mcapRefPrice > 0 ? floatShares * mcapRefPrice : null);

  let sizeMult = params.size_mult_by_bucket[floatBucket(floatShares)] ?? 1;
  let skipReason: SkipReason | null = null;

  // Hard filters
  if (params.exclude_biotech && meta?.isBiotech) skipReason = "hard_filter";
  if (!skipReason && params.exclude_energy && meta?.isEnergy) skipReason = "hard_filter";
  if (!skipReason && params.exclude_china && meta?.isChinaAdr) skipReason = "hard_filter";
  if (!skipReason && effectiveMcap != null && effectiveMcap > params.mcap_max) skipReason = "hard_filter";
  if (!skipReason && floatShares != null && floatShares < params.float_min) skipReason = "hard_filter";
  if (!skipReason && floatShares != null && floatShares > params.float_max) skipReason = "hard_filter";
  if (!skipReason && priceRef > 0 && priceRef < params.price_min) skipReason = "hard_filter";

  if (skipReason === "hard_filter") {
    journal.push({ t: rth[0]?.t ?? 0, type: "skip_hard_filter" });
  }

  // Gap gate
  if (!skipReason) {
    const gapForPmHigh = params.gap_ref === "pm_high" ? gapPmHighPct : gapPmPct;
    const ok =
      params.gap_ref === "pm_high"
        ? gapForPmHigh >= params.gap_min
        : gapPasses(params, gapOpenPct, gapPmPct);
    if (!ok) {
      skipReason = "gap";
      journal.push({
        t: rth[0]?.t ?? 0,
        type: "skip_gap",
        detail: { gapOpenPct, gapPmPct, gapPmHighPct, gap_min: params.gap_min },
      });
    }
  }

  // Crowded PM
  if (!skipReason) {
    if (pmVolumeM >= params.crowded_pm_m) {
      if (params.crowded_action === "block") {
        skipReason = "crowded_pm";
        journal.push({ t: rth[0]?.t ?? 0, type: "skip_crowded_pm", detail: { pmVolumeM } });
      } else if (params.crowded_action === "size_0.5") {
        sizeMult *= 0.5;
        journal.push({ t: rth[0]?.t ?? 0, type: "crowded_size_0.5", detail: { pmVolumeM } });
      } else if (params.crowded_action === "size_0.25") {
        sizeMult *= 0.25;
        journal.push({ t: rth[0]?.t ?? 0, type: "crowded_size_0.25", detail: { pmVolumeM } });
      }
    } else if (params.soft_warn_pm_m != null && pmVolumeM >= params.soft_warn_pm_m) {
      sizeMult *= 0.5;
      journal.push({ t: rth[0]?.t ?? 0, type: "soft_warn_pm", detail: { pmVolumeM } });
    }
  }

  // Nano rotation (gap 9) — block standard / size_down / journal reroute
  if (!skipReason && floatShares != null && floatShares < params.float_nano_max) {
    const rot = floatRotation ?? 0;
    if (rot >= params.rotation_trigger) {
      journal.push({
        t: rth[0]?.t ?? 0,
        type: "nano_rotation",
        detail: { floatShares, floatRotation: rot, action: params.variant_action },
      });
      if (params.variant_action === "block_standard_gus" || params.variant_action === "reroute_pullback_bounce") {
        // Full pullback entry deferred — treat as skip of standard GUS
        skipReason = "nano_rotation";
      } else if (params.variant_action === "size_down_only") {
        sizeMult *= 0.5;
      }
    }
  }

  // Locate
  if (!skipReason && params.locate_model !== "always_ok") {
    if (params.locate_model === "skip_if_nano_float" && floatShares != null && floatShares < params.float_nano_max) {
      skipReason = "no_locate";
    } else if (params.locate_model === "skip_if_rotation_gt" && floatRotation != null && floatRotation > params.rotation_trigger) {
      skipReason = "no_locate";
    } else if (params.locate_model === "random_skip" && params.locate_skip_rate > 0) {
      // Deterministic skip using dayKey hash for reproducibility
      const h = [...dayKey].reduce((a, c) => a + c.charCodeAt(0), 0);
      if (h % 100 < params.locate_skip_rate * 100) skipReason = "no_locate";
    }
  }

  return {
    symbol,
    dayKey,
    priorClose,
    rthOpen,
    pmLast,
    pmHigh,
    pmVolume,
    pmVolumeM,
    gapOpenPct,
    gapPmPct,
    gapPmHighPct,
    eDayVol,
    floatShares,
    mcapUsd: effectiveMcap,
    floatRotation,
    isBiotech: Boolean(meta?.isBiotech),
    isEnergy: Boolean(meta?.isEnergy),
    isChinaAdr: Boolean(meta?.isChinaAdr),
    priceRef,
    sizeMult,
    skipReason,
    journal,
  };
}
