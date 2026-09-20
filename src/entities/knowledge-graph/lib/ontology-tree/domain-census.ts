import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import { isContainmentRelation } from "./relations";

/**
 * The single source of truth for the size of a domain (or project).
 *
 * One domain used to read as three different numbers on three screens: 86 on the
 * canvas chip, 96 in the INDEX tree, 106 on the /projects card. The causes:
 * - Canvas: `subtreeWeight` counted **only elements** in the containment subtree.
 * - INDEX and insights: a tree walk that dropped a node whose parent chain had
 *   been resolved differently there.
 * - /projects: a graph BFS over everything reachable by containment.
 *
 * Rule: every screen that states "how many concepts belong to this
 * domain/project" uses this walk. It normalises containment
 * (`contains`/`belongs_to`) to parent→child and counts the capabilities and
 * elements the containment spine places under the target, per kind. Cycle-safe
 * (visited set), so duplicate paths never double-count.
 *
 * ## One owner per concept (2026-09-21)
 *
 * The walk used to follow **every** containment edge, so a concept two domains
 * both reach was counted by both. Measured on the dogfood vault: the eight domain
 * rows summed to 103 while the single project containing all of them counted 99 —
 * four concepts counted twice. The visible half of that arithmetic was worse than
 * the sum: the map drew the domain "AI Agent Integration" with an engraved 18 and
 * opened 17 nodes, because `element:saved-constellation-sidecar` reaches it
 * through `capability:mcp-server` while its own `domain:` names another domain.
 *
 * A concept hangs in exactly one place on the containment spine — the map can
 * only draw it once, and `buildOntologyTree` already resolves the same ambiguity
 * by keeping the **first** containment parent. This walk now resolves it the same
 * way, so the number engraved on a node, the INDEX row, and the nodes a cluster
 * chip opens are the same number. A concept several domains reference is counted
 * once, under the domain that holds it; the INDEX subcount caption says so.
 */
export interface DomainCensusRow {
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
  /** Only with the `collectCapabilityIds` option — the reached capability node ids. */
  capabilityIds?: string[];
}

const DEFAULT_TARGET_KINDS: readonly string[] = ["domain", "project"];

export interface DomainCensusOptions {
  /** For screens that need the member list as well as the count, such as project detail ranking its top capabilities. */
  collectCapabilityIds?: boolean;
}

export function computeDomainCensusRows(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  targetKinds: readonly string[] = DEFAULT_TARGET_KINDS,
  options: DomainCensusOptions = {},
): DomainCensusRow[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // One owner per concept: the first containment parent wins, the same tie-break
  // `buildOntologyTree` applies, so this walk and the tree agree about where a
  // concept hangs. Edge order is the derivation's, which is deterministic.
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
      // Short display title. The INDEX subcount, the domain capacity card, the
      // /projects domain list and MiniDomainMap all share these rows.
      title: node.display ?? node.title,
      capabilityCount,
      elementCount,
      total: capabilityCount + elementCount,
      ...(capabilityIds ? { capabilityIds } : {}),
    });
  }

  return rows.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
}

/** id → row, for O(1) lookup from a screen. */
export function domainCensusById(rows: readonly DomainCensusRow[]): ReadonlyMap<string, DomainCensusRow> {
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * "How many documents belong to this set of nodes." A containment BFS
 * (contains/belongs_to) never fills `projectIds` for document nodes, because by
 * vault convention documents connect to concepts only through `relates:`. So
 * this counts documents joined by **any** edge to a node already judged a member
 * — one hop wider than containment. The /projects card and the detail view must
 * use the same rule, or they contradict each other with "0 documents vs 3".
 */
export function countConnectedDocuments(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  memberIds: ReadonlySet<string>,
): number {
  let count = 0;
  for (const node of nodes) {
    if (node.kind !== "document") continue;
    if (memberIds.has(node.id)) {
      count += 1;
      continue;
    }
    const connected = edges.some(
      (edge) =>
        (edge.from === node.id && memberIds.has(edge.to)) ||
        (edge.to === node.id && memberIds.has(edge.from)),
    );
    if (connected) count += 1;
  }
  return count;
}
