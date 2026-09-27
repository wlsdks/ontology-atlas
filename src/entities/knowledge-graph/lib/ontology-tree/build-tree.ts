/**
 * Builds the ontology tree from `contains`/`belongs_to`, excluding document and readme nodes.
 * A cycle or a second parent promotes or drops the edge with a warning; each node appears once.
 * Deterministic order: kind, then displayed name. Parent map and child lists; the cycle check
 * walks each ancestor chain, O(V·d) for tree depth d.
 */

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import type { OntologyTreeBuildResult, OntologyTreeNode } from "./types";

const KIND_SORT_ORDER: Record<string, number> = {
  project: 0,
  domain: 1,
  capability: 2,
  element: 3,
  document: 4,
  'vault-readme': 5,
};

/** Siblings sort by the displayed name (`display ?? title`), which is what each locale's row shows. */
function compareNodes(a: KnowledgeGraphNode, b: KnowledgeGraphNode): number {
  const ka = KIND_SORT_ORDER[a.kind] ?? 99;
  const kb = KIND_SORT_ORDER[b.kind] ?? 99;
  if (ka !== kb) return ka - kb;
  return (a.display ?? a.title).localeCompare(b.display ?? b.title);
}

export function buildOntologyTree(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
): OntologyTreeBuildResult {
  const warnings: string[] = [];

  const treeNodes = nodes.filter((n) => n.kind !== "document" && n.kind !== "vault-readme");
  const nodeById = new Map(treeNodes.map((n) => [n.id, n] as const));

  // `contains` runs parent → child; `belongs_to` states the same reversed.
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
    } else {
      continue;
    }
    if (!nodeById.has(parentId) || !nodeById.has(childId)) continue;
    if (parentId === childId) {
      warnings.push(`self-parent edge ignored (${edge.type} ${parentId} → ${childId})`);
      continue;
    }
    if (parentOf.has(childId)) {
      const existingParent = parentOf.get(childId)!;
      // A repeated same parent (declared from both sides) is silent; only different parents warn.
      if (existingParent === parentId) continue;
      warnings.push(
        `node "${childId}" has multiple parents — keeping first (${existingParent}), ignoring (${parentId})`,
      );
      continue;
    }
    parentOf.set(childId, parentId);
  }

  function ancestorChainHasCycle(startId: string): boolean {
    const visited = new Set<string>();
    let curr: string | undefined = startId;
    while (curr) {
      if (visited.has(curr)) return true;
      visited.add(curr);
      curr = parentOf.get(curr);
    }
    return false;
  }

  for (const childId of [...parentOf.keys()]) {
    if (ancestorChainHasCycle(childId)) {
      warnings.push(`cycle detected at "${childId}" — promoted to root`);
      parentOf.delete(childId);
    }
  }

  const childrenOf = new Map<string, string[]>();
  for (const [childId, parentId] of parentOf) {
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId)!.push(childId);
  }

  const visited = new Set<string>();
  function buildSubtree(nodeId: string, depth: number): OntologyTreeNode | null {
    if (visited.has(nodeId)) {
      warnings.push(`node "${nodeId}" reached twice in tree — second occurrence skipped`);
      return null;
    }
    visited.add(nodeId);
    const node = nodeById.get(nodeId);
    if (!node) return null;
    const childIds = (childrenOf.get(nodeId) ?? []).slice();
    const children: OntologyTreeNode[] = [];
    for (const childId of childIds) {
      const child = buildSubtree(childId, depth + 1);
      if (child) children.push(child);
    }
    children.sort((a, b) => compareNodes(a.node, b.node));
    return { node, depth, children };
  }

  // Roots are nodes without a parent; projects sort first.
  const rootIds = treeNodes
    .filter((n) => !parentOf.has(n.id))
    .map((n) => n.id);

  const roots: OntologyTreeNode[] = [];
  for (const rid of rootIds) {
    const tree = buildSubtree(rid, 0);
    if (tree) roots.push(tree);
  }
  roots.sort((a, b) => compareNodes(a.node, b.node));

  // Orphans are tree nodes never visited, normally none.
  const orphans = treeNodes.filter((n) => !visited.has(n.id));

  return { roots, orphans, warnings };
}

/** Total node count, recursive. */
export function countTreeNodes(roots: OntologyTreeNode[]): number {
  let count = 0;
  function visit(node: OntologyTreeNode) {
    count++;
    for (const child of node.children) visit(child);
  }
  for (const root of roots) visit(root);
  return count;
}

/** Flattened in display order; `depth` drives indentation. */
export function flattenTree(roots: OntologyTreeNode[]): OntologyTreeNode[] {
  const out: OntologyTreeNode[] = [];
  function visit(node: OntologyTreeNode) {
    out.push(node);
    for (const child of node.children) visit(child);
  }
  for (const root of roots) visit(root);
  return out;
}
