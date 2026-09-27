import { findNameMatch, idSearchText, normalizeForMatch } from "@/shared/lib/node-name-match";
import type { KnowledgeGraphNode } from "../../model";
import type { OntologyTreeNode } from "./types";

/**
 * Whether a node's names or id slug match a `normalizeForMatch` query, by the `⌘K` palette's rule
 * (`findNameMatch`, `idSearchText`), so INDEX and the palette answer the same typing alike.
 */
export function knowledgeNodeMatchesQuery(
  node: KnowledgeGraphNode,
  normalizedQuery: string,
): boolean {
  if (normalizedQuery === "") return false;
  if (findNameMatch(node, normalizedQuery)) return true;
  const id = idSearchText(node.id, normalizedQuery);
  return id !== null && normalizeForMatch(id).includes(normalizedQuery);
}

/** Matching nodes only, not ancestors kept for structure; 0 for an empty query. */
export function countMatchingTreeNodes(
  roots: readonly OntologyTreeNode[],
  query: string,
): number {
  const normalizedQuery = normalizeForMatch(query);
  if (normalizedQuery === "") return 0;
  let count = 0;
  const walk = (node: OntologyTreeNode): void => {
    if (knowledgeNodeMatchesQuery(node.node, normalizedQuery)) count += 1;
    for (const child of node.children) walk(child);
  };
  for (const root of roots) walk(root);
  return count;
}

/** Keeps matches, their ancestors and all their descendants; an empty query returns the roots. */
export function filterTreeByQuery(
  roots: readonly OntologyTreeNode[],
  query: string,
): OntologyTreeNode[] {
  const normalizedQuery = normalizeForMatch(query);
  if (normalizedQuery === "") return roots.slice();

  function visit(node: OntologyTreeNode): OntologyTreeNode | null {
    const titleMatch = knowledgeNodeMatchesQuery(node.node, normalizedQuery);
    const filteredChildren = node.children
      .map(visit)
      .filter((c): c is OntologyTreeNode => c !== null);

    if (titleMatch) {
      // A match keeps its original children.
      return { ...node, children: node.children };
    }
    if (filteredChildren.length > 0) {
      // Kept only as an ancestor.
      return { ...node, children: filteredChildren };
    }
    return null;
  }

  return roots
    .map(visit)
    .filter((n): n is OntologyTreeNode => n !== null);
}

/**
 * Drops a kind with its whole subtree from a display tree (no ancestor preservation). Counts must
 * come from the full graph, not this output.
 */
export function filterTreeExcludeKind(
  roots: readonly OntologyTreeNode[],
  kind: string,
): OntologyTreeNode[] {
  function visit(node: OntologyTreeNode): OntologyTreeNode | null {
    if (node.node.kind === kind) return null;
    const filteredChildren = node.children
      .map(visit)
      .filter((c): c is OntologyTreeNode => c !== null);
    return { ...node, children: filteredChildren };
  }

  return roots
    .map(visit)
    .filter((n): n is OntologyTreeNode => n !== null);
}

/** Keeps nodes in `ids` and their ancestors, but only the matching descendants; empty `ids` → []. */
export function filterTreeByNodeIds(
  roots: readonly OntologyTreeNode[],
  ids: ReadonlySet<string>,
): OntologyTreeNode[] {
  if (ids.size === 0) return [];

  function visit(node: OntologyTreeNode): OntologyTreeNode | null {
    const match = ids.has(node.node.id);
    const filteredChildren = node.children
      .map(visit)
      .filter((c): c is OntologyTreeNode => c !== null);

    // Even a match hides its unchanged children.
    if (match || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    return null;
  }

  return roots
    .map(visit)
    .filter((n): n is OntologyTreeNode => n !== null);
}
