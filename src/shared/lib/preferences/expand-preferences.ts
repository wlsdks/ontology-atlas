import { useCallback, useSyncExternalStore } from "react";
import { clamp } from "./clamp";
import { notifyPreferenceChange, subscribeToPreferenceChange } from "./preference-change-event";
import { createStoredSnapshot } from "./stored-snapshot";

const EXPAND_KEY = "ontology-atlas:expand:v1";

/**
 * `pill` floats in free space on a dotted leader; `bar` sits above the selected node and states
 * how many will open; `badge` rides the node's shoulder and reveals itself on hover.
 */
export type ExpandAffordance = "pill" | "bar" | "badge";

/**
 * `disc` (golden-angle spiral, area grows as the square root of n) is the only way back if the `fan`
 * default's falsifier is observed: do not delete it (`docs/DECISIONS.md`). `ring` surrounds the
 * parent; `column` runs outward.
 */
export type ExpandStructure = "disc" | "fan" | "ring" | "column";

export const EXPAND_AFFORDANCES: readonly ExpandAffordance[] = ["pill", "bar", "badge"];
export const EXPAND_STRUCTURES: readonly ExpandStructure[] = ["disc", "fan", "ring", "column"];

/**
 * Owns the defaults the map constants (`EGO_NEIGHBOR_LIMIT`, `DISC_LABEL_TOP_K`,
 * `MAX_EXPANDED_PARENTS`) read, so each value lives in one place.
 */
export interface ExpandPreference {
  affordance: ExpandAffordance;
  structure: ExpandStructure;
  /** How many open at once; the rest need another press. */
  batchSize: number;
  /** Labels *attempted* per parent — not how many end up placed. */
  labelAttempts: number;
  /** Parents kept expanded at once; past this the least recently opened closes. */
  maxOpenParents: number;
}

/** Fan arc spacing 34 with a centred last row gave no overlapping marks (`docs/DECISIONS.md`). */
export const DEFAULT_EXPAND: ExpandPreference = {
  affordance: "bar",
  structure: "fan",
  batchSize: 24,
  labelAttempts: 8,
  maxOpenParents: 3,
};

/** The bounds the 27 measured combinations covered; widening them shows unmeasured screens. */
export const EXPAND_RANGES = {
  batchSize: { min: 4, max: 24, step: 1 },
  labelAttempts: { min: 3, max: 40, step: 1 },
  maxOpenParents: { min: 1, max: 6, step: 1 },
} as const satisfies Record<string, { min: number; max: number; step: number }>;

/** Same contract as `resolveFootprint`: a leaked `NaN` silently kills expansion on the map. */
export function resolveExpand(raw: unknown): ExpandPreference {
  if (typeof raw !== "object" || raw === null) return DEFAULT_EXPAND;
  const src = raw as Record<string, unknown>;
  const preferenceNumber = (key: keyof typeof EXPAND_RANGES): number => {
    const v = src[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_EXPAND[key];
    return Math.round(clamp(v, EXPAND_RANGES[key].min, EXPAND_RANGES[key].max));
  };
  return {
    affordance: (EXPAND_AFFORDANCES as readonly string[]).includes(src.affordance as string)
      ? (src.affordance as ExpandAffordance)
      : DEFAULT_EXPAND.affordance,
    structure: (EXPAND_STRUCTURES as readonly string[]).includes(src.structure as string)
      ? (src.structure as ExpandStructure)
      : DEFAULT_EXPAND.structure,
    batchSize: preferenceNumber("batchSize"),
    labelAttempts: preferenceNumber("labelAttempts"),
    maxOpenParents: preferenceNumber("maxOpenParents"),
  };
}

function readExpand(): ExpandPreference {
  if (typeof window === "undefined") return DEFAULT_EXPAND;
  try {
    const saved = window.localStorage.getItem(EXPAND_KEY);
    return saved === null ? DEFAULT_EXPAND : resolveExpand(JSON.parse(saved));
  } catch {
    return DEFAULT_EXPAND;
  }
}

export function writeExpand(value: ExpandPreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXPAND_KEY, JSON.stringify(resolveExpand(value)));
  } catch {
    // Storage blocked; the event still updates this session.
  }
  notifyPreferenceChange();
}

const expandSnapshot = createStoredSnapshot(EXPAND_KEY, DEFAULT_EXPAND, readExpand);

export function useExpand(): ExpandPreference {
  const getSnapshot = useCallback(() => expandSnapshot(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_EXPAND, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}
