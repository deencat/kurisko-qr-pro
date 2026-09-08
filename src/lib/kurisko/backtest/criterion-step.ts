/** Shared per-gate diagnose step used by K1 / K2 / K3 engines. */
export interface KuriskoCriterionStep {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

export function countPassingSteps(steps: KuriskoCriterionStep[], requiredIds?: ReadonlySet<string>): number {
  if (!requiredIds) return steps.filter((s) => s.pass).length;
  let n = 0;
  for (const id of requiredIds) {
    if (steps.find((s) => s.id === id)?.pass) n++;
  }
  return n;
}

export function allStepsPass(steps: KuriskoCriterionStep[], requiredIds?: ReadonlySet<string>): boolean {
  if (!requiredIds) {
    return steps.length > 0 && steps.every((s) => s.pass);
  }
  for (const id of requiredIds) {
    const step = steps.find((s) => s.id === id);
    if (!step || !step.pass) return false;
  }
  return true;
}
