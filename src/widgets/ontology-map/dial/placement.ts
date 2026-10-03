import { ladderStep } from "./rings";
import type { DialLabels, DialMemory, DialModel, DialWorld } from "./types";

export type DialPlacementState = "reading" | "provisional" | "settled";

export interface DialPlacementStep {
  state: DialPlacementState;
  held: number;
  released: boolean;
  model: DialModel;
}

export interface DialPlacementInput {
  model: DialModel;
  reading: boolean;
  capabilityTierRead: boolean;
  memory: DialMemory | null;
}

const LATE_FOLDERS = ["elements/"];
const TIER_FOLDERS = ["projects/", "domains/", "capabilities/", "elements/"];

export function capabilityTierRead(ids: Iterable<string>): boolean {
  let capabilities = false;
  let rest = false;
  for (const id of ids) {
    if (LATE_FOLDERS.some((f) => id.startsWith(f))) return true;
    if (id.startsWith("capabilities/")) capabilities = true;
    else if (id.includes("/") && !TIER_FOLDERS.some((f) => id.startsWith(f))) rest = true;
    if (capabilities && rest) return true;
  }
  return false;
}

function stepCount(step: number): number {
  return step === 0 ? 0 : 2 ** step;
}

export function emptyDialModel(model: DialModel): DialModel {
  return {
    ...model,
    domains: [],
    domainById: new Map(),
    capabilityById: new Map(),
    domainOf: new Map(),
    capabilityOf: new Map(),
    flows: [],
    flowByKey: new Map(),
    capabilityDependencies: [],
    orphanIds: [],
    dependents: new Map(),
  };
}

export function createDialPlacement(): { next(input: DialPlacementInput): DialPlacementStep } {
  let state: DialPlacementState | null = null;
  const baseline = new Map<string, number>();
  let held = 0;
  return {
    next({ model, reading, capabilityTierRead: tierRead, memory }) {
      if (!reading) {
        let applied = 0;
        if (state === "provisional") {
          for (const d of model.domains) {
            const shown = baseline.get(d.id);
            if (shown !== undefined && shown !== ladderStep(model.dependents.get(d.id) ?? 0)) applied += 1;
          }
        }
        state = "settled";
        baseline.clear();
        held = 0;
        return { state, held: applied, released: applied > 0, model };
      }
      if (state === "settled") baseline.clear();
      if (!tierRead && memory === null) {
        state = "reading";
        held = 0;
        return { state, held, released: false, model: emptyDialModel(model) };
      }
      state = "provisional";
      const dependents = new Map(model.dependents);
      held = 0;
      for (const d of model.domains) {
        const now = ladderStep(model.dependents.get(d.id) ?? 0);
        let shown = baseline.get(d.id);
        if (shown === undefined) {
          shown = memory?.angleById.get(d.id)?.step ?? now;
          baseline.set(d.id, shown);
        }
        if (shown !== now) {
          held += 1;
          dependents.set(d.id, stepCount(shown));
        }
      }
      return { state, held, released: false, model: held > 0 ? { ...model, dependents } : model };
    },
  };
}

export function dialPlacementLine(state: DialPlacementState, progress: { read: number; total: number } | null, labels: Pick<DialLabels, "reading" | "settling"> | null): string | null {
  if (labels === null || state === "settled") return null;
  if (state === "provisional") return labels.settling();
  return progress ? labels.reading(progress.read, progress.total) : null;
}

export interface DialPlacementView { state: DialPlacementState; held: number; progress: { read: number; total: number } | null }

const views = new WeakMap<DialWorld, DialPlacementView>();

export function setDialPlacement(dial: DialWorld, view: DialPlacementView): void {
  views.set(dial, view);
}

export function dialPlacementOf(dial: DialWorld): DialPlacementView {
  return views.get(dial) ?? { state: "settled", held: 0, progress: null };
}
