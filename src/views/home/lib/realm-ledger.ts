/**
 * Realm ledger derivations — what the left panel needs while a realm is expanded
 * (`?realm=slug`) and it shows one node's world instead of global content:
 * the realm root's subtree, its element/capability/domain/depth counts, and the
 * boundary edges leaving the realm together with a jump target for each outside
 * node (its domain-level container).
 *
 * All pure over graph input, so they test without render logic. This is the one
 * source for realm data inside views/home, derived without touching
 * topology-map-v2.
 */

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyTreeNode } from "@/entities/knowledge-graph/lib/ontology-tree";
import { buildContainmentParents, nearestDomainId } from "@/entities/knowledge-graph/lib/ontology-tree";

export interface RealmCensus {
  /** Element nodes in the subtree, root excluded. */
  elementCount: number;
  /** Capability nodes in the subtree, root excluded. */
  capabilityCount: number;
  /** Domain nodes in the subtree, root excluded. */
  domainCount: number;
  /** All descendants, root excluded. */
  descendantCount: number;
  /** Depth to the deepest descendant, relative to the root at 0; children only gives 1. */
  depth: number;
}

/** One boundary relation — an edge joining inside the realm to outside it. */
interface RealmBoundaryCrossing {
  edgeId: string;
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  relationType: string;
  /** The endpoint of this edge that lies outside the realm. */
  outsideId: string;
  /** Jump target: the outside node's domain-level container, or the node itself when it has none. */
  jumpRealmId: string;
}

export interface RealmBoundary {
  total: number;
  crossings: RealmBoundaryCrossing[];
}

/**
 * Structural edges excluded from the boundary. `contains`/`belongs_to` define
 * the tree shape itself, so they are not a signal of reaching outside; only
 * lateral relations (depends on, uses, implements, evidences) count.
 */
const REALM_BOUNDARY_EXCLUDED_TYPES: ReadonlySet<string> = new Set([
  "contains",
  "belongs_to",
]);

function findInNode(node: OntologyTreeNode, id: string): OntologyTreeNode | null {
  if (node.node.id === id) return node;
  for (const child of node.children) {
    const found = findInNode(child, id);
    if (found) return found;
  }
  return null;
}

/** Finds the `realmSlug` node's subtree among the tree roots; null when absent. */
export function findRealmSubtree(
  roots: readonly OntologyTreeNode[],
  realmSlug: string,
): OntologyTreeNode | null {
  for (const root of roots) {
    const found = findInNode(root, realmSlug);
    if (found) return found;
  }
  return null;
}

/** Element/capability/domain/depth counts for a realm subtree; the root itself is not counted. */
export function computeRealmCensus(subtree: OntologyTreeNode): RealmCensus {
  let elementCount = 0;
  let capabilityCount = 0;
  let domainCount = 0;
  let descendantCount = 0;
  let depth = 0;

  const walk = (node: OntologyTreeNode, relDepth: number): void => {
    if (relDepth > 0) {
      descendantCount += 1;
      if (relDepth > depth) depth = relDepth;
      if (node.node.kind === "element") elementCount += 1;
      else if (node.node.kind === "capability") capabilityCount += 1;
      else if (node.node.kind === "domain") domainCount += 1;
    }
    for (const child of node.children) walk(child, relDepth + 1);
  };
  walk(subtree, 0);

  return { elementCount, capabilityCount, domainCount, descendantCount, depth };
}

/** Every node id in the subtree, root included — the membership set boundary detection uses. */
export function collectRealmMemberIds(subtree: OntologyTreeNode): Set<string> {
  const ids = new Set<string>();
  const walk = (node: OntologyTreeNode): void => {
    ids.add(node.node.id);
    for (const child of node.children) walk(child);
  };
  walk(subtree);
  return ids;
}

/**
 * Derives the relations leaving the realm: an edge is a boundary when exactly
 * one endpoint is in the membership set. Structural edges and unresolved
 * endpoints are excluded, and the result is deterministically sorted.
 */
export function computeRealmBoundary(input: {
  edges: readonly KnowledgeGraphEdge[];
  memberIds: ReadonlySet<string>;
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>;
}): RealmBoundary {
  const { edges, memberIds, nodeById } = input;
  const parentOf = buildContainmentParents(edges, nodeById);
  const crossings: RealmBoundaryCrossing[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    if (REALM_BOUNDARY_EXCLUDED_TYPES.has(edge.type)) continue;
    const fromInside = memberIds.has(edge.from);
    const toInside = memberIds.has(edge.to);
    // Both inside or both outside is not a boundary.
    if (fromInside === toInside) continue;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) continue;
    if (seen.has(edge.id)) continue;
    seen.add(edge.id);

    const outsideNode = fromInside ? to : from;
    const jumpRealmId = nearestDomainId(outsideNode, parentOf, nodeById) ?? outsideNode.id;

    crossings.push({
      edgeId: edge.id,
      fromId: from.id,
      fromTitle: from.display ?? from.title,
      toId: to.id,
      toTitle: to.display ?? to.title,
      relationType: edge.type,
      outsideId: outsideNode.id,
      jumpRealmId,
    });
  }

  crossings.sort(
    (a, b) =>
      a.relationType.localeCompare(b.relationType) ||
      a.fromTitle.localeCompare(b.fromTitle) ||
      a.toTitle.localeCompare(b.toTitle) ||
      a.edgeId.localeCompare(b.edgeId),
  );

  return { total: crossings.length, crossings };
}
