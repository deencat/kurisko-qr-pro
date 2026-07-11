import type { K1CriterionStep } from "@/lib/kurisko/backtest/k1-diagnose";
import type { KuriskoK1Stage, KuriskoQuadDepths } from "./types";

function stepPass(steps: K1CriterionStep[], id: string): boolean {
  return steps.find((s) => s.id === id)?.pass ?? false;
}

/**
 * Map K1 criteria to QR Pro signal flow:
 * ARM → STAGE1 → DIV → CONFIRM → SIGNAL (RAG setup stages).
 */
export function resolveK1Stage(
  steps: K1CriterionStep[],
  side: "long" | "short",
  depthStruct: KuriskoQuadDepths
): KuriskoK1Stage {
  if (steps.every((s) => s.pass)) return "SIGNAL";

  const hasDiv = stepPass(steps, "bull_div") || stepPass(steps, "bear_div");
  const hook = side === "long" ? stepPass(steps, "hook_up") : stepPass(steps, "hook_down");
  const structQuad = side === "long" ? stepPass(steps, "struct_quad_os") : stepPass(steps, "struct_quad_ob");
  const execQuad = side === "long" ? stepPass(steps, "exec_quad_os") : stepPass(steps, "exec_quad_ob");
  const channelOk = stepPass(steps, "channel_down") || stepPass(steps, "channel_up");
  const railOk = stepPass(steps, "lower_rail") || stepPass(steps, "upper_rail");

  if (hasDiv && hook && execQuad) return "CONFIRM";
  if (hasDiv) return "DIV";
  if (channelOk && railOk && structQuad) return "STAGE1";
  if (depthStruct.allInZone) return "ARM";
  if (channelOk) return "WATCHING";
  return "WATCHING";
}

export function stageRank(stage: KuriskoK1Stage): number {
  const order: KuriskoK1Stage[] = ["WATCHING", "ARM", "STAGE1", "DIV", "CONFIRM", "SIGNAL"];
  return order.indexOf(stage);
}

export function isActionableStage(stage: KuriskoK1Stage): boolean {
  return stage === "CONFIRM" || stage === "SIGNAL";
}
