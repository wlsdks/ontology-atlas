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

function keysStartingWith(store: Storage, prefix: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

function warnUnsaved(payload: string, error: unknown): void {
  console.warn(
    `[change-baseline] The review baseline (${payload.length} characters) was not saved, so it lasts until this page reloads.`,
    error,
  );
}

/** Each folder's first-form entry becomes its own current-form entry, once per page. */
function convertFirstForm(store: Storage): void {
  store.removeItem(UNSCOPED_FIRST_FORM_KEY);
  for (const key of keysStartingWith(store, FIRST_FORM_KEY_PREFIX)) {
    const snap = deserializeSnapshot(store.getItem(key));
    store.removeItem(key);
    const target = `${PERSIST_KEY_PREFIX}${key.slice(FIRST_FORM_KEY_PREFIX.length)}`;
    if (!snap || store.getItem(target) !== null) continue;
    const payload = serializeSnapshot(snap);
    try {
      store.setItem(target, payload);
    } catch (error) {
      warnUnsaved(payload, error);
    }
  }
}

function persistBaseline(snap: OntologySnapshot | null): void {
  const store = storage();
  if (!store || baselineScope === null) return;
  const key = `${PERSIST_KEY_PREFIX}${baselineScope}`;
  if (!snap) {
    store.removeItem(key);
    return;
  }
  const payload = serializeSnapshot(snap);
  try {
    store.setItem(key, payload);
    return;
  } catch {
    // Other folders' baselines give way only when storage refuses this one.
    for (const other of keysStartingWith(store, PERSIST_KEY_PREFIX)) if (other !== key) store.removeItem(other);
  }
  try {
    store.setItem(key, payload);
  } catch (error) {
    // The previous save would otherwise come back after a reload as if it were this one.
    store.removeItem(key);
    warnUnsaved(payload, error);
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
  const first = baselineScope === null;
  baselineScope = scope;
  if (first) {
    const store = storage();
    if (store) convertFirstForm(store);
  }
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
  const snap = deserializeSnapshot(store.getItem(`${PERSIST_KEY_PREFIX}${baselineScope}`));
  if (!snap || !snapshotMatchesGraph(snap, nodes)) return false;
  baseline = snap;
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
