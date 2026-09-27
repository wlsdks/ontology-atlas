import { useSyncExternalStore } from "react";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import {
  snapshotOntology,
  type OntologySnapshot,
} from "./ontology-changeset";
import {
  deserializeSnapshot,
  serializeSnapshot,
  snapshotMatchesGraph,
} from "./change-baseline-persist";

const PERSIST_KEY_PREFIX = "demo:change-baseline:v2:";
const FIRST_FORM_KEY_PREFIX = "demo:change-baseline:v1:";
const UNSCOPED_FIRST_FORM_KEY = "demo:change-baseline:v1";

/** The active vault; while null nothing is stored or restored. */
let baselineScope: string | null = null;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isBaselineKey(key: string): boolean {
  return key.startsWith(PERSIST_KEY_PREFIX) || key.startsWith(FIRST_FORM_KEY_PREFIX) || key === UNSCOPED_FIRST_FORM_KEY;
}

function removeBaselinesExcept(store: Storage, keep: string | null): void {
  const stale: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key !== null && key !== keep && isBaselineKey(key)) stale.push(key);
  }
  for (const key of stale) store.removeItem(key);
}

function persistBaseline(snap: OntologySnapshot | null): void {
  const store = storage();
  if (!store || baselineScope === null) return;
  const key = `${PERSIST_KEY_PREFIX}${baselineScope}`;
  removeBaselinesExcept(store, snap ? key : null);
  if (!snap) return;
  const payload = serializeSnapshot(snap);
  try {
    store.setItem(key, payload);
  } catch (error) {
    // The previous save would otherwise come back after a reload as if it were this one.
    store.removeItem(key);
    console.warn(
      `[change-baseline] The review baseline (${payload.length} characters) was not saved, so it lasts until this page reloads.`,
      error,
    );
  }
}

/**
 * Module singleton read through `useSyncExternalStore`, so it survives client navigation and,
 * via localStorage, reloads. SSR-safe: starts null with no browser access at load.
 */
let baseline: OntologySnapshot | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Declares the active vault and drops the previous vault's baseline. */
export function setChangeBaselineScope(scope: string): void {
  if (baselineScope === scope) return;
  baselineScope = scope;
  if (baseline !== null) {
    baseline = null;
    emit();
  }
}

export function markChangeBaseline(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  takenAt: number,
): void {
  baseline = snapshotOntology(nodes, edges, takenAt);
  persistBaseline(baseline);
  emit();
}

export function clearChangeBaseline(): void {
  baseline = null;
  persistBaseline(null);
  emit();
}

/** Restores only a baseline that overlaps the graph and never overwrites one; true skips auto-mark. */
export function restorePersistedBaseline(
  nodes: readonly KnowledgeGraphNode[],
): boolean {
  const store = storage();
  if (!store || baseline !== null || baselineScope === null) return false;
  const stored = deserializeSnapshot(store.getItem(`${PERSIST_KEY_PREFIX}${baselineScope}`));
  const snap = stored ?? deserializeSnapshot(store.getItem(`${FIRST_FORM_KEY_PREFIX}${baselineScope}`));
  if (!snap || !snapshotMatchesGraph(snap, nodes)) return false;
  baseline = snap;
  if (!stored) persistBaseline(snap);
  emit();
  return true;
}

export function getChangeBaseline(): OntologySnapshot | null {
  return baseline;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Subscribes to the baseline snapshot; re-renders on mark and clear. */
export function useChangeBaseline(): OntologySnapshot | null {
  return useSyncExternalStore(subscribe, getChangeBaseline, () => null);
}

/** Auto-mark once a local vault loads with nodes; the caller does it once per mount so Clear sticks. */
export function shouldAutoMarkBaseline(input: {
  mode: "static" | "local";
  hasBaseline: boolean;
  nodeCount: number;
}): boolean {
  return input.mode === "local" && !input.hasBaseline && input.nodeCount > 0;
}
