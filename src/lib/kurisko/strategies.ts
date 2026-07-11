export type KuriskoStrategyId = "k1_quad_divergence" | "k2_stoch_bull_flag" | "k3_bear_flag";

export const KURISKO_STRATEGY_IDS: KuriskoStrategyId[] = [
  "k1_quad_divergence",
  "k2_stoch_bull_flag",
  "k3_bear_flag",
];

export const KURISKO_STRATEGY_LABELS: Record<KuriskoStrategyId, string> = {
  k1_quad_divergence: "K1 Quad Divergence (Holy Grail)",
  k2_stoch_bull_flag: "K2 20/20 Bull Flag",
  k3_bear_flag: "K3 Bear Flag / Sell Strength",
};

export function isKuriskoStrategyId(id: string): id is KuriskoStrategyId {
  return KURISKO_STRATEGY_IDS.includes(id as KuriskoStrategyId);
}
