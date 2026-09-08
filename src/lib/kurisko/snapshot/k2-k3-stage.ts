import type { KuriskoCriterionStep } from "@/lib/kurisko/backtest/criterion-step";

/** Compact K2 / K3 stage ladder for scanner matrix / snapshot. */
export type KuriskoFlagStage = "WATCHING" | "ARM" | "PULLBACK" | "HOOK" | "SIGNAL";

export const KURISKO_FLAG_STAGE_FLOW: KuriskoFlagStage[] = [
  "WATCHING",
  "ARM",
  "PULLBACK",
  "HOOK",
  "SIGNAL",
];

function stepPass(steps: KuriskoCriterionStep[], id: string): boolean {
  return steps.find((s) => s.id === id)?.pass ?? false;
}

/**
 * K2: ARM = embedded bull env · PULLBACK = flagpole+dip · HOOK = entry hook · SIGNAL = allPass.
 */
export function resolveK2Stage(steps: KuriskoCriterionStep[], allPass: boolean): KuriskoFlagStage {
  if (allPass || steps.filter((s) => s.id !== "warmup").every((s) => s.pass)) return "SIGNAL";
  const env = stepPass(steps, "k2_e1_up_env") && stepPass(steps, "k2_e2_embedded_bull");
  const pullback = stepPass(steps, "k2_e3_flagpole") && stepPass(steps, "k2_e4_pullback");
  const hook = stepPass(steps, "k2_entry_hook");
  if (hook && pullback && env) return "HOOK";
  if (pullback && env) return "PULLBACK";
  if (env) return "ARM";
  if (stepPass(steps, "k2_e1_up_env")) return "WATCHING";
  return "WATCHING";
}

/**
 * K3: ARM = weak+embed · PULLBACK = dead-cat · HOOK = surge/cross · SIGNAL = allPass.
 */
export function resolveK3Stage(steps: KuriskoCriterionStep[], allPass: boolean): KuriskoFlagStage {
  if (allPass) return "SIGNAL";
  const env = stepPass(steps, "k3_e1_weak_env") && stepPass(steps, "k3_e2_embedded_bear");
  const bounce = stepPass(steps, "k3_e3_dead_cat");
  const hook = stepPass(steps, "k3_e4_surge") || stepPass(steps, "k3_sell_cross");
  if (hook && bounce && env && stepPass(steps, "k3_sell_cross")) return "HOOK";
  if (bounce && env) return "PULLBACK";
  if (env) return "ARM";
  return "WATCHING";
}

export function flagStageRank(stage: KuriskoFlagStage): number {
  return KURISKO_FLAG_STAGE_FLOW.indexOf(stage);
}
