import type { KnowledgeGraphNode } from "../../model";
import type { OntologySnapshot } from "./ontology-changeset";

/**
 * Persists the change baseline snapshot to localStorage, plus the guard that decides whether
 * it may be restored. The baseline has to survive a reload so that (1) "reviewed"
 * acknowledgements are preserved and (2) the app can show what changed while you were away
 * (persisted baseline vs the current state on disk).
 *
 * **The scope check is a content-overlap guard.** Threading a vault key through would be the
 * obvious approach, but the FSD boundaries make it awkward to inject a vault identifier into
 * the store cleanly. Instead a single baseline is persisted and applied on restore only when
 * its node set *overlaps the current graph enough*. Loading a different vault gives ~0
 * overlap and the baseline is discarded, so no garbage diff appears; the same vault (even
 * after an agent added or changed nodes) gives high overlap and restores.
 *
 * Pure functions, no IO — the store owns the localStorage calls.
 */

interface SerializedSnapshot {
  v: 1;
  nodeSigs: [string, string][];
  nodeKinds: [string, string][];
  edgeKeys: string[];
  takenAt: number;
}

export function serializeSnapshot(snap: OntologySnapshot): string {
  const payload: SerializedSnapshot = {
    v: 1,
    nodeSigs: [...snap.nodeSigs],
    nodeKinds: [...snap.nodeKinds],
    edgeKeys: [...snap.edgeKeys],
    takenAt: snap.takenAt,
  };
  return JSON.stringify(payload);
}

/** Deserialize; returns null on any shape mismatch, so corrupt or older payloads are ignored. */
export function deserializeSnapshot(raw: string | null): OntologySnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<SerializedSnapshot>;
  if (
    p.v !== 1 ||
    !Array.isArray(p.nodeSigs) ||
    !Array.isArray(p.nodeKinds) ||
    !Array.isArray(p.edgeKeys) ||
    typeof p.takenAt !== "number"
  ) {
    return null;
  }
  try {
    return {
      nodeSigs: new Map(p.nodeSigs),
      nodeKinds: new Map(p.nodeKinds),
      edgeKeys: new Set(p.edgeKeys),
      takenAt: p.takenAt,
    };
  } catch {
    return null;
  }
}

/**
 * May the persisted baseline be applied to the current graph — the content-overlap guard.
 * True when the fraction of baseline nodes *still present in the current graph* meets the
 * threshold.
 *
 * - A different vault: almost no baseline node is present, so the ratio is ~0 and the
 *   baseline is discarded rather than producing a garbage diff.
 * - The same vault, even after an agent added or changed nodes: most baseline nodes are
 *   present, so the ratio is high and it restores. Added nodes do not enter the denominator
 *   (which is the baseline size), so any number of additions is harmless.
 * - An empty baseline: false, there is nothing to match against.
 */
export function snapshotMatchesGraph(
  snap: OntologySnapshot,
  currentNodes: readonly KnowledgeGraphNode[],
  threshold = 0.5,
): boolean {
  const total = snap.nodeSigs.size;
  if (total === 0) return false;
  const currentIds = new Set(currentNodes.map((n) => n.id));
  let present = 0;
  for (const id of snap.nodeSigs.keys()) {
    if (currentIds.has(id)) present += 1;
  }
  return present / total >= threshold;
}
