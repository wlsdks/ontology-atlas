/** First-parent, cycle-safe trees excluding documents/readmes. O(V + E) traversal plus sibling sorting. */

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

  const childrenOf = new Map<string, string[]>();
  for (const [childId, parentId] of parentOf) {
    const children = childrenOf.get(parentId);
    if (children) children.push(childId);
    else childrenOf.set(parentId, [childId]);
  }
  const rooted = new Set<string>();
  const markRooted = (rootId: string) => {
    const pending = [rootId];
    while (pending.length > 0) {
      const id = pending.pop()!;
      if (rooted.has(id)) continue;
      rooted.add(id);
      for (const child of childrenOf.get(id) ?? []) pending.push(child);
    }
  };
  for (const node of treeNodes) {
    if (!parentOf.has(node.id)) markRooted(node.id);
  }
  // Unrooted nodes reach a cycle. Preserve first-edge promotion order and mark each node once.
  for (const childId of parentOf.keys()) {
    if (rooted.has(childId)) continue;
    warnings.push(`cycle detected at "${childId}" — promoted to root`);
    parentOf.delete(childId);
    markRooted(childId);
  }

  const visited = new Set<string>();
  function buildSubtree(nodeId: string, depth: number): OntologyTreeNode | null {
    if (visited.has(nodeId)) {
      warnings.push(`node "${nodeId}" reached twice in tree — second occurrence skipped`);
      return null;
    }
    const rootNode = nodeById.get(nodeId);
    if (!rootNode) return null;
    const root: OntologyTreeNode = { node: rootNode, depth, children: [] };
    visited.add(nodeId);
    const pending = [root];
    while (pending.length > 0) {
      const tree = pending.pop()!;
      for (const childId of childrenOf.get(tree.node.id) ?? []) {
        if (parentOf.get(childId) !== tree.node.id) continue;
        const childNode = nodeById.get(childId);
        if (!childNode) continue;
        const child: OntologyTreeNode = { node: childNode, depth: tree.depth + 1, children: [] };
        visited.add(childId);
        tree.children.push(child);
        pending.push(child);
      }
      tree.children.sort((a, b) => compareNodes(a.node, b.node));
    }
    return root;
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

/** Total node count with an explicit stack, O(V). */
export function countTreeNodes(roots: OntologyTreeNode[]): number {
  let count = 0;
  const pending = roots.slice();
  while (pending.length > 0) {
    const node = pending.pop()!;
    count += 1;
    for (const child of node.children) pending.push(child);
  }
  return count;
}

/** Flattened in display order; `depth` drives indentation. O(V), independent of call-stack depth. */
export function flattenTree(roots: OntologyTreeNode[]): OntologyTreeNode[] {
  const out: OntologyTreeNode[] = [];
  const pending = roots.slice().reverse();
  while (pending.length > 0) {
    const node = pending.pop()!;
    out.push(node);
    for (let i = node.children.length - 1; i >= 0; i -= 1) pending.push(node.children[i]);
  }
  return out;
}
