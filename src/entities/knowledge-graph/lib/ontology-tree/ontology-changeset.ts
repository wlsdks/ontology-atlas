import { runSliced, type RunSlicedOptions } from "@/shared/lib/scheduling/run-sliced";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";

/**
 * Nodes and relations changed against a session snapshot; the browser runtimes have no Git, so
 * a Git diff comes from MCP/CLI instead. Pure.
 */

// U+0001 never occurs in a slug, title or type, so joined fields cannot collide (a+bc vs ab+c).
const SEP = "\u0001";

export interface OntologySnapshot {
  /** nodeId → hash of kind/title/summary plus sorted outgoing edges. */
  nodeSigs: Map<string, number>;
  /** Kept apart from the signature so a removed node's kind can still be shown. */
  nodeKinds: Map<string, string>;
  /** `"from\u0001to\u0001type"`, joined with SEP. */
  edgeKeys: Set<string>;
  /** Stamped by the caller, in ms. */
  takenAt: number;
}

export interface OntologyChangeset {
  addedNodes: string[];
  removedNodes: string[];
  changedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
  /** Sum of added + removed + changed nodes and added + removed edges. */
  total: number;
  /** Added or changed nodes, for highlighting. */
  touchedNodeIds: Set<string>;
  /** Removed nodes' kinds from the baseline; present nodes' kinds come from `nodeById`. */
  removedNodeKinds: Map<string, string>;
}

export function joinEdgeKey(from: string, to: string, type: string): string {
  return `${from}${SEP}${to}${SEP}${type}`;
}

export function splitEdgeKey(key: string): [string, string, string] | null {
  const parts = key.split(SEP);
  return parts.length === 3 ? [parts[0], parts[1], parts[2]] : null;
}

function edgeKey(edge: Pick<KnowledgeGraphEdge, "from" | "to" | "type">): string {
  return joinEdgeKey(edge.from, edge.to, edge.type);
}

// cyrb53: an edit is missed only if one node's old and new signatures collide (about 2^-53).
export function hashNodeSignature(signature: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < signature.length; i += 1) {
    const code = signature.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Kind, title, summary and sorted outgoing edges; coordinates and timestamps are ignored. */
function nodeSignature(
  node: KnowledgeGraphNode,
  outgoingByNode: Map<string, string[]>,
): number {
  const edges = (outgoingByNode.get(node.id) ?? []).slice().sort();
  return hashNodeSignature(
    [
      node.kind,
      node.title,
      node.summary ?? "",
      edges.join(","),
    ].join(SEP),
  );
}

function buildOutgoingMap(edges: readonly KnowledgeGraphEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const list = map.get(edge.from);
    const entry = `${edge.to}:${edge.type}`;
    if (list) list.push(entry);
    else map.set(edge.from, [entry]);
  }
  return map;
}

/** One graph's signatures; with duplicate ids the last node's signature wins, as in a snapshot. */
interface GraphSignatures {
  sigById: Map<string, number>;
  nodeKinds: Map<string, string>;
  edgeKeys: Set<string>;
}

type SignatureCache = WeakMap<readonly KnowledgeGraphEdge[], WeakMap<readonly KnowledgeGraphNode[], GraphSignatures>>;

// Graph arrays are never mutated once published, so one pass per (edges, nodes) pair serves the
// baseline and every reader's diff.
let signatureCache: SignatureCache = new WeakMap();

/** Drops every cached graph, so a folder left behind releases its signatures even if its arrays live on. */
export function forgetGraphSignatures(): void {
  signatureCache = new WeakMap();
}

function cachedSignatures(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): GraphSignatures | undefined {
  return signatureCache.get(edges)?.get(nodes);
}

function storeSignatures(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  nodeSigs: number[],
): GraphSignatures {
  const sigById = new Map<string, number>();
  const nodeKinds = new Map<string, string>();
  nodes.forEach((node, index) => {
    sigById.set(node.id, nodeSigs[index]);
    nodeKinds.set(node.id, node.kind);
  });
  const edgeKeys = new Set<string>();
  for (const edge of edges) edgeKeys.add(edgeKey(edge));
  const signatures = { sigById, nodeKinds, edgeKeys };
  let byNodes = signatureCache.get(edges);
  if (!byNodes) {
    byNodes = new WeakMap();
    signatureCache.set(edges, byNodes);
  }
  byNodes.set(nodes, signatures);
  return signatures;
}

/** O(V + E log d) on the first call for a graph, O(1) after. */
function graphSignatures(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): GraphSignatures {
  const cached = cachedSignatures(nodes, edges);
  if (cached) return cached;
  const outgoing = buildOutgoingMap(edges);
  return storeSignatures(nodes, edges, nodes.map((node) => nodeSignature(node, outgoing)));
}

/** The same pass as `graphSignatures`, yielding between slices, so a later snapshot or diff is free. */
export async function prepareGraphSignatures(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  options?: RunSlicedOptions,
): Promise<void> {
  if (cachedSignatures(nodes, edges)) return;
  const outgoing = buildOutgoingMap(edges);
  const nodeSigs = await runSliced(nodes, (node) => nodeSignature(node, outgoing), 8, options);
  if (!cachedSignatures(nodes, edges)) storeSignatures(nodes, edges, nodeSigs);
}

/** `takenAt` comes from the caller so this stays pure. The maps are shared with the cache and never mutated. */
export function snapshotOntology(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  takenAt: number,
): OntologySnapshot {
  const { sigById, nodeKinds, edgeKeys } = graphSignatures(nodes, edges);
  return { nodeSigs: sigById, nodeKinds, edgeKeys, takenAt };
}

function emptyChangeset(): OntologyChangeset {
  return {
    addedNodes: [],
    removedNodes: [],
    changedNodes: [],
    addedEdges: [],
    removedEdges: [],
    total: 0,
    touchedNodeIds: new Set(),
    removedNodeKinds: new Map(),
  };
}

/** A null baseline reports no changes. Diffs cached signatures in O(V + E); a baseline taken from this very graph is O(1). */
export function computeOntologyChangeset(
  baseline: OntologySnapshot | null,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): OntologyChangeset {
  if (!baseline) return emptyChangeset();
  const signatures = graphSignatures(nodes, edges);
  // With duplicate ids the map holds one signature per id, so each copy is hashed on its own.
  const uniqueIds = signatures.sigById.size === nodes.length;
  if (uniqueIds && baseline.nodeSigs === signatures.sigById && baseline.edgeKeys === signatures.edgeKeys) {
    return emptyChangeset();
  }
  let outgoing: Map<string, string[]> | null = null;
  const signatureOf = (node: KnowledgeGraphNode): number | undefined =>
    uniqueIds ? signatures.sigById.get(node.id) : nodeSignature(node, (outgoing ??= buildOutgoingMap(edges)));

  const addedNodes: string[] = [];
  const changedNodes: string[] = [];
  for (const node of nodes) {
    const prevSig = baseline.nodeSigs.get(node.id);
    if (prevSig === undefined) {
      addedNodes.push(node.id);
    } else if (prevSig !== signatureOf(node)) {
      changedNodes.push(node.id);
    }
  }
  const removedNodes: string[] = [];
  const removedNodeKinds = new Map<string, string>();
  for (const id of baseline.nodeSigs.keys()) {
    if (!signatures.sigById.has(id)) {
      removedNodes.push(id);
      const kind = baseline.nodeKinds.get(id);
      if (kind) removedNodeKinds.set(id, kind);
    }
  }

  const currentEdgeKeys = signatures.edgeKeys;
  const addedEdges: string[] = [];
  for (const key of currentEdgeKeys) {
    if (!baseline.edgeKeys.has(key)) addedEdges.push(key);
  }
  const removedEdges: string[] = [];
  for (const key of baseline.edgeKeys) {
    if (!currentEdgeKeys.has(key)) removedEdges.push(key);
  }

  const touchedNodeIds = new Set<string>([...addedNodes, ...changedNodes]);
  return {
    addedNodes,
    removedNodes,
    changedNodes,
    addedEdges,
    removedEdges,
    total:
      addedNodes.length +
      removedNodes.length +
      changedNodes.length +
      addedEdges.length +
      removedEdges.length,
    touchedNodeIds,
    removedNodeKinds,
  };
}

/**
 * Advances the baseline for one node only, so a later edit is flagged again. Returns a new
 * snapshot for `useSyncExternalStore`; vault files are untouched. Null baseline: no-op.
 * Copies the baseline maps and scans its edge keys: O(V + E log d).
 */
export function acknowledgeNodeChange(
  baseline: OntologySnapshot | null,
  nodeId: string,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): OntologySnapshot | null {
  if (!baseline) return null;
  const nodeSigs = new Map(baseline.nodeSigs);
  const nodeKinds = new Map(baseline.nodeKinds);
  const edgeKeys = new Set(baseline.edgeKeys);

  // SEP ends the prefix, so only edges with `from === nodeId` match.
  const fromPrefix = `${nodeId}${SEP}`;
  for (const key of baseline.edgeKeys) {
    if (key.startsWith(fromPrefix)) edgeKeys.delete(key);
  }

  const current = nodes.find((n) => n.id === nodeId);
  if (current) {
    const outgoing = buildOutgoingMap(edges);
    nodeSigs.set(nodeId, nodeSignature(current, outgoing));
    nodeKinds.set(nodeId, current.kind);
    for (const e of edges) {
      if (e.from === nodeId) edgeKeys.add(edgeKey(e));
    }
  } else {
    nodeSigs.delete(nodeId);
    nodeKinds.delete(nodeId);
  }
  return { nodeSigs, nodeKinds, edgeKeys, takenAt: baseline.takenAt };
}
