import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { isContainmentRelation } from "./relations";

/**
 * Node counts per kind, for charts and chips. `document` and `project` are included
 * too — filter at the call site if needed. The Map's iteration order follows the
 * input node order.
 */
export function computeKindDistribution(
  nodes: readonly KnowledgeGraphNode[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of nodes) {
    map.set(n.kind, (map.get(n.kind) ?? 0) + 1);
  }
  return map;
}

/**
 * Degree per node: outgoing plus incoming edges, with a self-loop counted once.
 *
 * Edges pointing at nodes absent from the index are ignored (orphan edges). Every
 * input node appears as a key, degree 0 included, so the UI decides whether to show
 * zero-degree nodes.
 */
export function computeDegreeCentrality(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const n of nodes) degrees.set(n.id, 0);
  for (const edge of edges) {
    const fromExists = degrees.has(edge.from);
    const toExists = degrees.has(edge.to);
    if (edge.from === edge.to) {
      if (fromExists) degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
      continue;
    }
    if (fromExists) degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    if (toExists) degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }
  return degrees;
}

export interface OntologyDegreeRow {
  node: KnowledgeGraphNode;
  degree: number;
}

export interface DomainCouplingDomainRow {
  domain: KnowledgeGraphNode;
  nodeCount: number;
  outgoing: number;
  incoming: number;
  selfEdges: number;
}

export interface DomainCouplingConnectionRow {
  from: KnowledgeGraphNode;
  to: KnowledgeGraphNode;
  count: number;
  relationCounts: Array<{ type: string; count: number }>;
  examples: KnowledgeGraphEdge[];
}

export interface DomainCouplingMatrix {
  domainCount: number;
  nodeCount: number;
  assignedNodeCount: number;
  unassignedNodeCount: number;
  crossDomainEdgeCount: number;
  selfDomainEdgeCount: number;
  domains: DomainCouplingDomainRow[];
  /** Total distinct domain pairs before `connections` is truncated by `limit`, so
   * the UI and CLI can say "top N of M" instead of capping silently. */
  totalConnectionCount: number;
  connections: DomainCouplingConnectionRow[];
}

export interface ComputeDomainCouplingMatrixOptions {
  types?: readonly string[];
}

/**
 * **All** hub candidates sorted by descending degree (degree > 0; `document` and
 * `project` excluded by default). Nothing is sliced off, so the caller can report
 * "top N of M" rather than capping silently.
 */
export function rankAllByDegree(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  options?: { includeKinds?: ReadonlyArray<string>; excludeKinds?: ReadonlyArray<string> },
): OntologyDegreeRow[] {
  const exclude = new Set(options?.excludeKinds ?? ["document", "project"]);
  const include = options?.includeKinds ? new Set(options.includeKinds) : null;
  const degrees = computeDegreeCentrality(nodes, edges);

  const rows: OntologyDegreeRow[] = [];
  for (const node of nodes) {
    if (include && !include.has(node.kind)) continue;
    if (exclude.has(node.kind)) continue;
    const degree = degrees.get(node.id) ?? 0;
    if (degree === 0) continue;
    rows.push({ node, degree });
  }
  rows.sort((a, b) => {
    if (b.degree !== a.degree) return b.degree - a.degree;
    return a.node.title.localeCompare(b.node.title);
  });
  return rows;
}

/**
 * The domain coupling matrix — the browser, local-first counterpart to MCP
 * `query_ontology(domain_matrix)`. It computes which domain depends on or connects
 * to which from the currently derived frontmatter graph alone, with no server or MCP.
 *
 * Domain assignment walks the containment tree to the nearest domain ancestor; a
 * domain node is assigned to itself. Meta nodes with no domain ancestor (document,
 * project) stay unassigned and are excluded from coupling edges. `contains` /
 * `belongs_to` are structural edges used *for* that assignment, so they are excluded
 * from the coupling count: for a human-facing UI, showing pressure on boundaries is
 * more interpretable than showing the hierarchy again.
 */
export function computeDomainCouplingMatrix(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  limit = 8,
  options: ComputeDomainCouplingMatrixOptions = {},
): DomainCouplingMatrix {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const parentOf = buildContainmentParents(edges, nodeById);
  const typeSet = options.types ? new Set(options.types) : null;
  const domainByNode = new Map<string, string>();
  const domainRows = new Map<string, DomainCouplingDomainRow>();

  for (const node of nodes) {
    if (node.kind === "domain") {
      domainRows.set(node.id, {
        domain: node,
        nodeCount: 0,
        outgoing: 0,
        incoming: 0,
        selfEdges: 0,
      });
    }
  }

  for (const node of nodes) {
    const domainId = nearestDomainId(node, parentOf, nodeById);
    if (!domainId) continue;
    domainByNode.set(node.id, domainId);
    const row = domainRows.get(domainId);
    if (row) row.nodeCount += 1;
  }

  const connectionRows = new Map<
    string,
    {
      from: string;
      to: string;
      count: number;
      relationCounts: Map<string, number>;
      examples: KnowledgeGraphEdge[];
    }
  >();
  let selfDomainEdgeCount = 0;
  let crossDomainEdgeCount = 0;

  for (const edge of edges) {
    if (isContainmentRelation(edge.type)) continue;
    if (typeSet && !typeSet.has(edge.type)) continue;
    const fromDomain = domainByNode.get(edge.from);
    const toDomain = domainByNode.get(edge.to);
    if (!fromDomain || !toDomain) continue;
    if (fromDomain === toDomain) {
      selfDomainEdgeCount += 1;
      const row = domainRows.get(fromDomain);
      if (row) row.selfEdges += 1;
      continue;
    }

    crossDomainEdgeCount += 1;
    const fromRow = domainRows.get(fromDomain);
    const toRow = domainRows.get(toDomain);
    if (fromRow) fromRow.outgoing += 1;
    if (toRow) toRow.incoming += 1;

    const key = `${fromDomain}\0${toDomain}`;
    if (!connectionRows.has(key)) {
      connectionRows.set(key, {
        from: fromDomain,
        to: toDomain,
        count: 0,
        relationCounts: new Map(),
        examples: [],
      });
    }
    const row = connectionRows.get(key)!;
    row.count += 1;
    row.relationCounts.set(edge.type, (row.relationCounts.get(edge.type) ?? 0) + 1);
    if (row.examples.length < 3) row.examples.push(edge);
  }

  const assignedNodeCount = domainByNode.size;
  return {
    domainCount: domainRows.size,
    nodeCount: nodes.length,
    assignedNodeCount,
    unassignedNodeCount: nodes.length - assignedNodeCount,
    crossDomainEdgeCount,
    selfDomainEdgeCount,
    totalConnectionCount: connectionRows.size,
    domains: [...domainRows.values()].sort(
      (a, b) =>
        b.outgoing + b.incoming - (a.outgoing + a.incoming) ||
        b.nodeCount - a.nodeCount ||
        a.domain.title.localeCompare(b.domain.title),
    ),
    connections: [...connectionRows.values()]
      .map((row) => ({
        from: nodeById.get(row.from)!,
        to: nodeById.get(row.to)!,
        count: row.count,
        relationCounts: [...row.relationCounts.entries()]
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
        examples: row.examples,
      }))
      .sort((a, b) => b.count - a.count || a.from.title.localeCompare(b.from.title))
      .slice(0, limit),
  };
}

/**
 * Nearest containment PARENT per node — `contains`/`belongs_to` edges walked
 * to a single `childId -> parentId` map (first parent wins if duplicates).
 * Exported (R+ full-detail A1) so the reach-instrument's per-domain
 * breakdown can resolve an ARBITRARY reachable node's owning domain via
 * {@link nearestDomainId} without re-deriving this walk a second time.
 */
export function buildContainmentParents(
  edges: readonly KnowledgeGraphEdge[],
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>,
): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const edge of edges) {
    let parentId: string | undefined;
    let childId: string | undefined;
    if (edge.type === "contains") {
      parentId = edge.from;
      childId = edge.to;
    } else if (edge.type === "belongs_to") {
      parentId = edge.to;
      childId = edge.from;
    }
    if (!parentId || !childId) continue;
    if (!nodeById.has(parentId) || !nodeById.has(childId) || parentId === childId) continue;
    if (parentOf.has(childId)) continue;
    parentOf.set(childId, parentId);
  }
  return parentOf;
}

/**
 * Walk containment PARENTS up from `node` until a `kind: domain` ancestor is
 * found (a domain node resolves to itself). Returns `null` for nodes with no
 * domain ancestor (project/document) or a broken/cyclic containment chain.
 */
export function nearestDomainId(
  node: KnowledgeGraphNode,
  parentOf: ReadonlyMap<string, string>,
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>,
): string | null {
  if (node.kind === "domain") return node.id;
  const visited = new Set<string>([node.id]);
  let current = parentOf.get(node.id);
  while (current) {
    if (visited.has(current)) return null;
    visited.add(current);
    const parent = nodeById.get(current);
    if (!parent) return null;
    if (parent.kind === "domain") return parent.id;
    current = parentOf.get(current);
  }
  return null;
}

/**
 * The N most recently updated nodes by descending `lastApprovedAt`, for the activity
 * feed; ties break on title ascending. `document` and `project` are included, since
 * they are part of the activity too.
 *
 * The field name dates from the v1 cloud LLM worker; here it simply means "last
 * written or updated". In vault mode it is a sentinel value, so vault nodes all tie.
 */
export function selectRecentNodes(
  nodes: readonly KnowledgeGraphNode[],
  limit = 8,
): KnowledgeGraphNode[] {
  return [...nodes]
    .sort((a, b) => {
      const ta = a.lastApprovedAt.getTime();
      const tb = b.lastApprovedAt.getTime();
      if (tb !== ta) return tb - ta;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}
