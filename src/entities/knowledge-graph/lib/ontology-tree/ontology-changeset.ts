import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";

/**
 * Nodes and relations changed against a session snapshot; the browser runtimes have no Git, so
 * a Git diff comes from MCP/CLI instead. Pure.
 */

// U+0001 never occurs in a slug, title or type, so joined fields cannot collide (a+bc vs ab+c).
const SEP = "\u0001";

export interface OntologySnapshot {
  /** nodeId → kind/title/summary plus sorted outgoing edges. */
  nodeSigs: Map<string, string>;
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

function edgeKey(edge: Pick<KnowledgeGraphEdge, "from" | "to" | "type">): string {
  return `${edge.from}${SEP}${edge.to}${SEP}${edge.type}`;
}

/** Kind, title, summary and sorted outgoing edges; coordinates and timestamps are ignored. */
function nodeSignature(
  node: KnowledgeGraphNode,
  outgoingByNode: Map<string, string[]>,
): string {
  const edges = (outgoingByNode.get(node.id) ?? []).slice().sort();
  return [
    node.kind,
    node.title,
    node.summary ?? "",
    edges.join(","),
  ].join(SEP);
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

/** `takenAt` comes from the caller so this stays pure. */
export function snapshotOntology(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  takenAt: number,
): OntologySnapshot {
  const outgoing = buildOutgoingMap(edges);
  const nodeSigs = new Map<string, string>();
  const nodeKinds = new Map<string, string>();
  for (const node of nodes) {
    nodeSigs.set(node.id, nodeSignature(node, outgoing));
    nodeKinds.set(node.id, node.kind);
  }
  const edgeKeys = new Set<string>();
  for (const edge of edges) edgeKeys.add(edgeKey(edge));
  return { nodeSigs, nodeKinds, edgeKeys, takenAt };
}

/** A null baseline reports no changes. Signature maps and edge-key sets diff in O(V + E). */
export function computeOntologyChangeset(
  baseline: OntologySnapshot | null,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): OntologyChangeset {
  const empty: OntologyChangeset = {
    addedNodes: [],
    removedNodes: [],
    changedNodes: [],
    addedEdges: [],
    removedEdges: [],
    total: 0,
    touchedNodeIds: new Set(),
    removedNodeKinds: new Map(),
  };
  if (!baseline) return empty;

  const outgoing = buildOutgoingMap(edges);
  const currentIds = new Set(nodes.map((n) => n.id));

  const addedNodes: string[] = [];
  const changedNodes: string[] = [];
  for (const node of nodes) {
    const prevSig = baseline.nodeSigs.get(node.id);
    if (prevSig === undefined) {
      addedNodes.push(node.id);
    } else if (prevSig !== nodeSignature(node, outgoing)) {
      changedNodes.push(node.id);
    }
  }
  const removedNodes: string[] = [];
  const removedNodeKinds = new Map<string, string>();
  for (const id of baseline.nodeSigs.keys()) {
    if (!currentIds.has(id)) {
      removedNodes.push(id);
      const kind = baseline.nodeKinds.get(id);
      if (kind) removedNodeKinds.set(id, kind);
    }
  }

  const currentEdgeKeys = new Set(edges.map(edgeKey));
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
 * Copies the baseline maps and scans its edge keys: O(V + E).
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
