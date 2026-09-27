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
  type PersistedBaseline,
} from "./change-baseline-persist";

const PERSIST_KEY = "demo:change-baseline:v2";
const LEGACY_KEY_PREFIX = "demo:change-baseline:v1";
const legacyKeyFor = (scope: string) => `${LEGACY_KEY_PREFIX}:${scope}`;

/** The active vault; while null nothing is stored or restored. */
let baselineScope: string | null = null;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function removeLegacyBaselines(store: Storage, keep: string): void {
  const legacy: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key !== null && key !== keep && key.startsWith(LEGACY_KEY_PREFIX)) legacy.push(key);
  }
  for (const key of legacy) store.removeItem(key);
}

function persistBaseline(snap: OntologySnapshot | null): void {
  const store = storage();
  if (!store || baselineScope === null) return;
  if (!snap) {
    store.removeItem(PERSIST_KEY);
    return;
  }
  const payload = serializeSnapshot(snap, baselineScope);
  try {
    store.setItem(PERSIST_KEY, payload);
  } catch (error) {
    // The previous save would otherwise come back after a reload as if it were this one.
    store.removeItem(PERSIST_KEY);
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
  const first = baselineScope === null;
  baselineScope = scope;
  if (first) {
    const store = storage();
    if (store) removeLegacyBaselines(store, legacyKeyFor(scope));
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
  const legacyKey = legacyKeyFor(baselineScope);
  const legacy = store.getItem(legacyKey);
  store.removeItem(legacyKey);
  let stored: PersistedBaseline | null = deserializeSnapshot(store.getItem(PERSIST_KEY));
  let carriedOver = false;
  if (stored?.scope !== baselineScope) {
    stored = deserializeSnapshot(legacy);
    carriedOver = stored !== null;
  }
  if (!stored || !snapshotMatchesGraph(stored.snapshot, nodes)) return false;
  baseline = stored.snapshot;
  if (carriedOver) persistBaseline(baseline);
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
