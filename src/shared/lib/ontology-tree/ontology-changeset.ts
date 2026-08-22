import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * What changed in the ontology — nodes and relations added / changed / removed relative
 * to a session baseline snapshot.
 *
 * **Why a snapshot and not a git diff.** The web and Tauri (WKWebView) runtimes are
 * browsers, so no git subprocess exists. For a human-facing change view (a meeting, a
 * design review) the natural baseline is a snapshot of "now". A git HEAD diff is offered
 * separately from the MCP/CLI side, which has Node.
 *
 * Pure functions — no React, no IO. Same input, same output.
 */

// Field separator, U+0001. It can never occur in a slug, title or relation type, so the
// join is collision-free. With an empty or ordinary separator, two different inputs whose
// field boundary moved would concatenate to the same string (a+bc vs ab+c) and the change
// would be missed. Written as a `\u0001` escape rather than a raw control character so it
// stays visible in the source — an invisible literal is easily mistaken for "".)
const SEP = "\u0001";

export interface OntologySnapshot {
  /** nodeId → content signature (kind/title/summary plus sorted outgoing edges). */
  nodeSigs: Map<string, string>;
  /**
   * nodeId → kind. The signature is SEP-joined and cannot be parsed back, so kind is kept
   * separately — otherwise the review UI could not show the kind of a removed node, which
   * by definition is absent from the current graph.
   */
  nodeKinds: Map<string, string>;
  /** Set of edge keys, `"from\u0001to\u0001type"` joined with SEP. */
  edgeKeys: Set<string>;
  /** When the snapshot was taken (ms), stamped by the caller. Used for labels and sorting. */
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
  /** Fast lookup of added|changed nodes, for UI highlighting. */
  touchedNodeIds: Set<string>;
  /**
   * nodeId → kind for removed nodes, preserved from the baseline. A removed node is not in
   * the current graph, so `nodeById` cannot supply its kind, and the review panel would be
   * unable to say whether what was deleted was a domain or an element. added/changed nodes
   * are still in the graph, so callers read their kind from `nodeById` directly.
   */
  removedNodeKinds: Map<string, string>;
}

function edgeKey(edge: Pick<KnowledgeGraphEdge, "from" | "to" | "type">): string {
  return `${edge.from}${SEP}${edge.to}${SEP}${edge.type}`;
}

/**
 * Content signature for one node; an unchanged signature counts as no change. Built from
 * kind/title/summary plus that node's sorted outgoing edges — this catches substantive
 * frontmatter changes (name, summary, relations added or removed) while ignoring noise
 * such as coordinates and timestamps.
 */
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

/**
 * Takes a baseline snapshot of the current graph. `takenAt` comes from the caller, so
 * `Date.now()` stays outside and this module stays pure.
 */
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

/**
 * Computes what changed in the current graph relative to a baseline snapshot. A null
 * baseline means none has been set, which reports as no changes.
 */
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
 * Marks one node's change as reviewed by advancing the baseline for that node alone. The
 * node then drops out of the changeset, and if an agent edits it *again* its signature
 * differs and it is flagged afresh — no change can slip through. Reusing the changeset
 * machinery instead of keeping a separate reviewed-set is what makes the count naturally
 * mean "not yet reviewed".
 *
 * **Non-destructive**: the vault `.md` files are untouched; only the in-memory baseline
 * advances. Always returns a *new* snapshot object, leaving the original intact, because
 * `useSyncExternalStore` needs the identity change to re-render.
 *
 * - Node present in the current graph (added|changed): refresh nodeSig/nodeKind and sync
 *   its outgoing edges (`from === nodeId`) into the baseline — drop the stale ones, add
 *   the current ones.
 * - Node absent from the current graph (removed): drop it from the baseline.
 * - Null baseline: there is nothing to acknowledge, so this is a no-op.
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

  // Drop that node's stale outgoing edges from the baseline. The SEP terminates the
  // prefix, so only `from === nodeId` matches — no prefix collisions.
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
    // Acknowledging a removal drops the node from the baseline.
    nodeSigs.delete(nodeId);
    nodeKinds.delete(nodeId);
  }
  return { nodeSigs, nodeKinds, edgeKeys, takenAt: baseline.takenAt };
}
