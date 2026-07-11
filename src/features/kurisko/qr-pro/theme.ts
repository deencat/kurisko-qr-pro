import type { KuriskoK1Stage } from "@/lib/kurisko/snapshot/types";

export const QR_SYMBOLS = ["US500", "US100", "GOLD", "BTCUSD", "US30"] as const;

export const QR_SYMBOL_META: Record<
  string,
  { short: string; name: string; qrAlias: string }
> = {
  US500: { short: "US500", name: "S&P 500 E-mini", qrAlias: "ES" },
  US100: { short: "US100", name: "NASDAQ 100 E-mini", qrAlias: "NQ" },
  GOLD: { short: "GOLD", name: "Gold Futures", qrAlias: "GC" },
  BTCUSD: { short: "BTCUSD", name: "BTC Futures", qrAlias: "BTC" },
  US30: { short: "US30", name: "Dow E-mini", qrAlias: "YM" },
};

/** QR Pro display labels (reference uses 40-4; METS K1 uses 34-3). */
export const QR_STOCH_DISPLAY: Record<string, string> = {
  "9-3": "9-3",
  "14-3": "14-3",
  "34-3": "40-4",
  "60-10": "60-10",
};

export const STAGE_BADGE: Record<KuriskoK1Stage, string> = {
  WATCHING: "bg-slate-600 text-slate-100",
  ARM: "bg-amber-400 text-amber-950",
  STAGE1: "bg-yellow-500 text-yellow-950",
  DIV: "bg-violet-500 text-white",
  CONFIRM: "bg-cyan-500 text-cyan-950",
  SIGNAL: "bg-emerald-500 text-emerald-950",
};

export function stageBadgeLabel(stage: KuriskoK1Stage, side: "long" | "short", tf = "1m"): string {
  const dir = side === "long" ? "LONG" : "SHORT";
  if (stage === "ARM") return `${tf} ARMED ${dir}`;
  if (stage === "WATCHING") return "WATCHING";
  return `${tf} ${stage} ${dir}`;
}

/** Stoch bar color by raw value (reference: green low, orange mid, red high). */
export function stochBarColor(value: number): string {
  if (value <= 25) return "bg-emerald-500";
  if (value <= 45) return "bg-lime-500";
  if (value <= 55) return "bg-amber-400";
  if (value <= 75) return "bg-orange-500";
  return "bg-rose-500";
}

export function formatQrPrice(price: number): string {
  if (price > 10_000) return price.toFixed(0);
  if (price > 1000) return price.toFixed(1);
  if (price < 100) return price.toFixed(2);
  return price.toFixed(1);
}

export function vortexLeanLabel(
  label: "BULL" | "BEAR" | "NEUTRAL",
  side: "long" | "short"
): string {
  if (label === "BULL" && side === "long") return "LEAN BUY";
  if (label === "BEAR" && side === "short") return "LEAN SELL";
  if (label === "BULL") return "BULL BIAS";
  if (label === "BEAR") return "BEAR BIAS";
  return "NEUTRAL";
}
