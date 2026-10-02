import type { DialModel } from "./types";

export function ladderStep(n: number): number {
  if (n < 2) return 0;
  return Math.min(5, Math.floor(Math.log2(n)));
}

export interface DialRingPlan { step: number; domainIds: string[] }

export function ringPlan(model: DialModel): DialRingPlan[] {
  const byStep = new Map<number, string[]>();
  for (const d of model.domains) {
    const step = ladderStep(model.dependents.get(d.id) ?? 0);
    const list = byStep.get(step);
    if (list) list.push(d.id);
    else byStep.set(step, [d.id]);
  }
  return [...byStep.entries()].sort(([a], [b]) => b - a).map(([step, domainIds]) => ({ step, domainIds }));
}
