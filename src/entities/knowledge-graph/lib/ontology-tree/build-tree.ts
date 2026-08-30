/**
 * Ontology tree builder: KnowledgeGraphNode + KnowledgeGraphEdge → a tree.
 *
 * Algorithm:
 *   1. `document` / `vault-readme` nodes are excluded (reader/evidence docs).
 *   2. `contains` edges give parent→child. `belongs_to` is its reverse, so reading
 *      it child→parent yields the same result.
 *   3. A node with no parent is a root (usually `kind=project`).
 *   4. Cycle detection: walking the parent chain and reaching yourself is a cycle →
 *      promote that child to a root and warn.
 *   5. Multiple parents: when one child is the `to` of more than one `contains`
 *      edge, only the first survives and the rest warn.
 *   6. A node appears in the tree at most once — marked visited on first use.
 *
 * Ordering:
 *   - roots: kind first (project before everything else), then title.
 *   - children: kind (domain > capability > element), then title.
 *   - Deterministic: the same input always produces the same output.
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

function compareNodes(a: KnowledgeGraphNode, b: KnowledgeGraphNode): number {
  const ka = KIND_SORT_ORDER[a.kind] ?? 99;
  const kb = KIND_SORT_ORDER[b.kind] ?? 99;
  if (ka !== kb) return ka - kb;
  return a.title.localeCompare(b.title);
}

export function buildOntologyTree(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
): OntologyTreeBuildResult {
  const warnings: string[] = [];

  // 1. Exclude graph reader/evidence docs.
  const treeNodes = nodes.filter((n) => n.kind !== "document" && n.kind !== "vault-readme");
  const nodeById = new Map(treeNodes.map((n) => [n.id, n] as const));

  // 2. Parent map: on a `contains` edge `from` is the parent and `to` the child;
  //    `belongs_to` says the same thing reversed (child belongs_to parent).
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
      // The same parent appearing twice (frontmatter declared from both sides) is
      // silent: derive-ontology-from-vault's dedup normally blocks it, and this is
      // defence in depth for an externally supplied manifest. Only genuine multiple
      // parents — different parents — surface to the user.
      if (existingParent === parentId) continue;
      warnings.push(
        `node "${childId}" has multiple parents — keeping first (${existingParent}), ignoring (${parentId})`,
      );
      continue;
    }
    parentOf.set(childId, parentId);
  }

  // 3. Cycle detection: a child that ends up being its own ancestor.
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

  // 4. Build the childrenOf index.
  const childrenOf = new Map<string, string[]>();
  for (const [childId, parentId] of parentOf) {
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId)!.push(childId);
  }

  // 5. Recursive build.
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

  // 6. Root candidates are the nodes absent from parentOf; project kind sorts first.
  const rootIds = treeNodes
    .filter((n) => !parentOf.has(n.id))
    .map((n) => n.id);

  const roots: OntologyTreeNode[] = [];
  for (const rid of rootIds) {
    const tree = buildSubtree(rid, 0);
    if (tree) roots.push(tree);
  }
  roots.sort((a, b) => compareNodes(a.node, b.node));

  // 7. Orphans are non-document nodes never visited, i.e. absent from the tree —
  //    normally none.
  const orphans = treeNodes.filter((n) => !visited.has(n.id));

  return { roots, orphans, warnings };
}

/** Total node count in the tree, counted recursively. Used by the minimap and stats. */
export function countTreeNodes(roots: OntologyTreeNode[]): number {
  let count = 0;
  function visit(node: OntologyTreeNode) {
    count++;
    for (const child of node.children) visit(child);
  }
  for (const root of roots) visit(root);
  return count;
}

/** Flattens to a list; `depth` drives indentation. The step before an expand/collapse UI. */
export function flattenTree(roots: OntologyTreeNode[]): OntologyTreeNode[] {
  const out: OntologyTreeNode[] = [];
  function visit(node: OntologyTreeNode) {
    out.push(node);
    for (const child of node.children) visit(child);
  }
  for (const root of roots) visit(root);
  return out;
}
