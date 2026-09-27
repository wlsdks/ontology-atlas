/**
 * What the left panel needs while `?realm=` shows one node's world: its subtree, counts and
 * boundary edges, each outside node paired with its domain-level container as the jump target.
 */

import type { KnowledgeGraphEdge, KnowledgeGraphNode, OntologyTreeNode } from "@/entities/knowledge-graph";
import { buildContainmentParents, nearestDomainId } from "@/entities/knowledge-graph";

export interface RealmCensus {
  elementCount: number;
  capabilityCount: number;
  domainCount: number;
  descendantCount: number;
  /** Root at 0; children only gives 1. */
  depth: number;
}

interface RealmBoundaryCrossing {
  edgeId: string;
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  relationType: string;
  outsideId: string;
  /** The outside node's domain-level container, or the node itself without one. */
  jumpRealmId: string;
}

export interface RealmBoundary {
  total: number;
  crossings: RealmBoundaryCrossing[];
}

/** `contains`/`belongs_to` shape the tree itself; only lateral relations count as reaching outside. */
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

/** Root included. */
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
 * An edge is a boundary when exactly one endpoint is inside. O(E × depth): Set membership per edge,
 * a parent walk per crossing for its jump target, then a deterministic sort.
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
