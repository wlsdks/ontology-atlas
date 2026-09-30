import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import { isContainmentRelation } from "./relations";

/**
 * The single count of a domain's or project's capabilities and elements. Each concept is counted
 * once, under its first containment parent as `buildOntologyTree` places it; cycle-safe.
 */
export interface DomainCensusRow {
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
  /** With `collectCapabilityIds` only. */
  capabilityIds?: string[];
}

const DEFAULT_TARGET_KINDS: readonly string[] = ["domain", "project"];

export interface DomainCensusOptions {
  /** Also collect member ids, e.g. for ranking top capabilities. */
  collectCapabilityIds?: boolean;
}

// One containment search per target over adjacency lists: O(T·(V + E)).
export function computeDomainCensusRows(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  targetKinds: readonly string[] = DEFAULT_TARGET_KINDS,
  options: DomainCensusOptions = {},
): DomainCensusRow[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // First containment parent wins, as in `buildOntologyTree`; edge order is deterministic.
  const ownerOf = new Map<string, string>();
  for (const edge of edges) {
    if (!isContainmentRelation(edge.type)) continue;
    const [parent, child] = edge.type === "belongs_to" ? [edge.to, edge.from] : [edge.from, edge.to];
    if (!nodeById.has(parent) || !nodeById.has(child)) continue;
    if (parent === child) continue;
    if (ownerOf.has(child)) continue;
    ownerOf.set(child, parent);
  }

  const childrenOf = new Map<string, string[]>();
  for (const [child, parent] of ownerOf) {
    const arr = childrenOf.get(parent);
    if (arr) arr.push(child);
    else childrenOf.set(parent, [child]);
  }

  const targets = new Set(targetKinds);
  const rows: DomainCensusRow[] = [];

  for (const node of nodes) {
    if (!targets.has(node.kind)) continue;

    let capabilityCount = 0;
    let elementCount = 0;
    const capabilityIds: string[] | null = options.collectCapabilityIds ? [] : null;
    const visited = new Set<string>([node.id]);
    const queue: string[] = [node.id];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      const children = childrenOf.get(current);
      if (!children) continue;
      for (const child of children) {
        if (visited.has(child)) continue;
        visited.add(child);
        queue.push(child);
        const childNode = nodeById.get(child);
        if (childNode?.kind === "capability") {
          capabilityCount += 1;
          capabilityIds?.push(child);
        } else if (childNode?.kind === "element") elementCount += 1;
      }
    }

    rows.push({
      id: node.id,
      // Short display title, shared by every screen reading these rows.
      title: node.display ?? node.title,
      capabilityCount,
      elementCount,
      total: capabilityCount + elementCount,
      ...(capabilityIds ? { capabilityIds } : {}),
    });
  }

  return rows.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
}

/** id → row. */
export function domainCensusById(rows: readonly DomainCensusRow[]): ReadonlyMap<string, DomainCensusRow> {
  return new Map(rows.map((row) => [row.id, row]));
}

/** One-hop document count via any relation, O(V + E). */
export function countConnectedDocuments(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  memberIds: ReadonlySet<string>,
): number {
  const documents = nodes.filter((node) => node.kind === "document");
  if (documents.length === 0 || memberIds.size === 0) return 0;
  const connectedIds = new Set<string>();
  for (const edge of edges) {
    if (memberIds.has(edge.from)) connectedIds.add(edge.to);
    if (memberIds.has(edge.to)) connectedIds.add(edge.from);
  }
  let count = 0;
  for (const node of documents) {
    if (memberIds.has(node.id) || connectedIds.has(node.id)) count += 1;
  }
  return count;
}
