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

// Persists the change baseline across reloads. Non-destructive: it stores review
// state only and never touches the vault's `.md` files.
//
// **Why the vault is part of the key** (repaired 2026-08-01). There used to be a
// single global key, so per-vault content shared one slot and collided twice:
//
// 1. Marking a baseline in vault A and then opening B let B's first mark
//    **overwrite** A's, so returning to A had lost the reference point for "what
//    changed while I was away".
// 2. The content-overlap guard (`snapshotMatchesGraph`) runs **only on restore**.
//    Switching folders mid-session asks nobody, so A's in-memory baseline was
//    compared against B's graph and **all of B counted as newly added**.
//
// Hence a per-vault key, plus dropping the in-memory baseline the moment the
// active scope changes (`setChangeBaselineScope`). The overlap guard stays as a
// second net for opening a completely different vault under the same folder name.
const PERSIST_KEY_PREFIX = "demo:change-baseline:v1:";
/**
 * The global key from before vaults were scoped. **Never read back** — there is
 * no way to tell which vault the value belongs to, and reading it is precisely
 * the defect above. Cleared once, when a scope is first set (otherwise a value
 * nobody reads stays forever).
 */
const LEGACY_UNSCOPED_KEY = "demo:change-baseline:v1";

/**
 * The vault currently on screen. `null` means nobody has said yet, and until
 * then **nothing is stored or restored** — a baseline whose vault is unknown is
 * itself an input to a false verdict, so this fails closed.
 */
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
 * The shared change-baseline store — a module-level singleton.
 *
 * Marking a baseline in the change panel makes every other screen see the same
 * value. A module store plus `useSyncExternalStore` rather than React context,
 * so the state survives App Router client-side navigation (moving between
 * screens during a meeting while looking at the same changes). It also survives
 * a full reload: the baseline is persisted to localStorage and
 * `restorePersistedBaseline` brings it back behind the content-overlap guard.
 *
 * Safe for SSR and static export: no browser API is touched at module load, the
 * baseline starts `null`, and the server snapshot is `null` too.
 */
let baseline: OntologySnapshot | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * **Declares which vault is active** — changing it drops the previous vault's
 * baseline on the spot.
 *
 * Without this call nothing is stored or restored (fail closed): having no
 * baseline at all is more honest than some screen quietly deciding one exists.
 *
 * The single consumer is `OntologyLiveBaselineInit`, which lives in the layout,
 * feeds the vault scope into this store, and redoes restore/auto-mark when the
 * scope changes.
 */
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

/** The vault scope this store currently knows (for tests and diagnostics). */
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

/**
 * Restores the persisted baseline after a reload, *only when it overlaps the
 * current graph enough* (a different vault is discarded). Skips restoring when a
 * baseline already exists, so nothing is overwritten. Returning true tells the
 * caller (`OntologyLiveBaselineInit`) to skip auto-marking. Non-destructive.
 */
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

/**
 * Live mode: decides whether to mark a baseline automatically once a local vault
 * has loaded with nodes and none exists yet, so later agent edits pulse without
 * a click. Static/dogfood mode never changes, so it gets no automatic baseline.
 *
 * The caller (`OntologyLiveBaselineInit`) auto-marks **once per mount** — that is
 * what stops an explicit Clear from being undone immediately.
 */
export function shouldAutoMarkBaseline(input: {
  mode: "static" | "local";
  hasBaseline: boolean;
  nodeCount: number;
}): boolean {
  return input.mode === "local" && !input.hasBaseline && input.nodeCount > 0;
}
