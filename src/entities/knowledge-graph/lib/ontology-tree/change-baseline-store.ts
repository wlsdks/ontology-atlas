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

// Review state only, keyed per vault so one vault's baseline never overwrites another's or
// counts a different vault as all added. The overlap guard still catches a same-named vault.
const PERSIST_KEY_PREFIX = "demo:change-baseline:v1:";
/** The pre-scope global key; never read, cleared once when a scope is first set. */
const LEGACY_UNSCOPED_KEY = "demo:change-baseline:v1";

/** The active vault; while null nothing is stored or restored. */
let baselineScope: string | null = null;

function persistBaseline(snap: OntologySnapshot | null): void {
  if (typeof window === "undefined" || baselineScope === null) return;
  try {
    const key = `${PERSIST_KEY_PREFIX}${baselineScope}`;
    if (snap) window.localStorage.setItem(key, serializeSnapshot(snap));
    else window.localStorage.removeItem(key);
  } catch {
    /* private mode — skip */
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
  if (first && typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LEGACY_UNSCOPED_KEY);
    } catch {
      /* private mode — skip */
    }
  }
  if (baseline !== null) {
    baseline = null;
    emit();
  }
}

/** For tests and diagnostics. */
export function getChangeBaselineScope(): string | null {
  return baselineScope;
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
  if (typeof window === "undefined" || baseline !== null) return false;
  if (baselineScope === null) return false;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(`${PERSIST_KEY_PREFIX}${baselineScope}`);
  } catch {
    return false;
  }
  const snap = deserializeSnapshot(raw);
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
