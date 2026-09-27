import type { KnowledgeGraphNode } from "../../model";
import {
  hashNodeSignature,
  joinEdgeKey,
  splitEdgeKey,
  type OntologySnapshot,
} from "./ontology-changeset";

/** Baseline (de)serialization and the content-overlap guard deciding whether a restore applies. Pure. */

/**
 * Each id once; everything else a number. `sigs[i]` and `kindOf[i]` belong to `ids[i]`, and
 * `ids` continues with edge endpoints that are not nodes. `edges` is flat [from, to, type] index
 * triples into `ids` and `types`.
 */
interface SerializedSnapshot {
  v: 2;
  scope: string;
  takenAt: number;
  ids: string[];
  sigs: number[];
  kinds: string[];
  kindOf: number[];
  types: string[];
  edges: number[];
}

interface SerializedSnapshotV1 {
  v: 1;
  nodeSigs: [string, string][];
  nodeKinds: [string, string][];
  edgeKeys: string[];
  takenAt: number;
}

export interface PersistedBaseline {
  /** Null for the first form, which kept the vault in its storage key. */
  scope: string | null;
  snapshot: OntologySnapshot;
}

function indexer<T>(table: T[]): (value: T) => number {
  const indexOf = new Map<T, number>();
  return (value) => {
    let index = indexOf.get(value);
    if (index === undefined) {
      index = table.length;
      table.push(value);
      indexOf.set(value, index);
    }
    return index;
  };
}

export function serializeSnapshot(snap: OntologySnapshot, scope: string): string {
  const ids: string[] = [];
  const kinds: string[] = [];
  const types: string[] = [];
  const idIndex = indexer(ids);
  const kindIndex = indexer(kinds);
  const typeIndex = indexer(types);
  const sigs: number[] = [];
  const kindOf: number[] = [];
  for (const [id, sig] of snap.nodeSigs) {
    idIndex(id);
    sigs.push(sig);
    const kind = snap.nodeKinds.get(id);
    kindOf.push(kind === undefined ? -1 : kindIndex(kind));
  }
  const edges: number[] = [];
  for (const key of snap.edgeKeys) {
    const parts = splitEdgeKey(key);
    if (!parts) continue;
    edges.push(idIndex(parts[0]), idIndex(parts[1]), typeIndex(parts[2]));
  }
  const payload: SerializedSnapshot = { v: 2, scope, takenAt: snap.takenAt, ids, sigs, kinds, kindOf, types, edges };
  return JSON.stringify(payload);
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const isIndexArray = (value: unknown, below: number, allowMissing = false): value is number[] =>
  Array.isArray(value) &&
  value.every((item) => Number.isInteger(item) && item < below && (item >= 0 || (allowMissing && item === -1)));

function fromV2(p: Partial<SerializedSnapshot>): PersistedBaseline | null {
  if (typeof p.scope !== "string" || typeof p.takenAt !== "number") return null;
  if (!isStringArray(p.ids) || !isStringArray(p.kinds) || !isStringArray(p.types)) return null;
  if (!Array.isArray(p.sigs) || !p.sigs.every((sig) => Number.isSafeInteger(sig) && sig >= 0)) return null;
  if (p.sigs.length > p.ids.length || !isIndexArray(p.kindOf, p.kinds.length, true)) return null;
  if (p.kindOf.length !== p.sigs.length || !isIndexArray(p.edges, p.ids.length) || p.edges.length % 3 !== 0) return null;
  const { ids, kinds, types, sigs, kindOf, edges } = p as SerializedSnapshot;
  const nodeSigs = new Map<string, number>();
  const nodeKinds = new Map<string, string>();
  for (let i = 0; i < sigs.length; i += 1) {
    nodeSigs.set(ids[i], sigs[i]);
    if (kindOf[i] >= 0) nodeKinds.set(ids[i], kinds[kindOf[i]]);
  }
  const edgeKeys = new Set<string>();
  for (let i = 0; i < edges.length; i += 3) {
    const type = types[edges[i + 2]];
    if (type === undefined) return null;
    edgeKeys.add(joinEdgeKey(ids[edges[i]], ids[edges[i + 1]], type));
  }
  return { scope: p.scope, snapshot: { nodeSigs, nodeKinds, edgeKeys, takenAt: p.takenAt } };
}

const isStringPairArray = (value: unknown): value is [string, string][] =>
  Array.isArray(value) &&
  value.every((pair) => Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string");

function fromV1(p: Partial<SerializedSnapshotV1>): PersistedBaseline | null {
  if (!isStringPairArray(p.nodeSigs) || !isStringPairArray(p.nodeKinds) || !isStringArray(p.edgeKeys)) return null;
  if (typeof p.takenAt !== "number") return null;
  const nodeSigs = new Map<string, number>();
  for (const [id, signature] of p.nodeSigs) nodeSigs.set(id, hashNodeSignature(signature));
  return {
    scope: null,
    snapshot: { nodeSigs, nodeKinds: new Map(p.nodeKinds), edgeKeys: new Set(p.edgeKeys), takenAt: p.takenAt },
  };
}

/** Null on any shape mismatch, so corrupt or unknown payloads are ignored. */
export function deserializeSnapshot(raw: string | null): PersistedBaseline | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const version = (parsed as { v?: unknown }).v;
  if (version === 2) return fromV2(parsed as Partial<SerializedSnapshot>);
  if (version === 1) return fromV1(parsed as Partial<SerializedSnapshotV1>);
  return null;
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
