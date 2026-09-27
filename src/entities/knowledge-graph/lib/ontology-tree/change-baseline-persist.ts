import type { KnowledgeGraphNode } from "../../model";
import type { OntologySnapshot } from "./ontology-changeset";

/** Baseline (de)serialization and the content-overlap guard deciding whether a restore applies. Pure. */

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

/** Null on any shape mismatch, so corrupt or older payloads are ignored. */
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
 * True when enough baseline nodes are still present; additions do not count against it, a
 * different vault scores ~0, and an empty baseline is false.
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
