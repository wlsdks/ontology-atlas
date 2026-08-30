import type { KnowledgeGraphNode } from "../../model";
import type { OntologyTreeNode } from "./types";

/**
 * Does a node match the search text — lower-case containment on `title` or on
 * `id` (kind:slug). `query` is expected to be already trimmed and lower-cased.
 * Single source so tree filtering/counting and orphan filtering share one rule.
 */
export function knowledgeNodeMatchesQuery(
  node: KnowledgeGraphNode,
  trimmedLowerQuery: string,
): boolean {
  if (trimmedLowerQuery === "") return false;
  return (
    node.title.toLowerCase().includes(trimmedLowerQuery)
    || node.id.toLowerCase().includes(trimmedLowerQuery)
  );
}

/**
 * How many tree nodes actually match the query, excluding structural nodes kept
 * only as ancestors. Same match rule as `filterTreeByQuery`; 0 for an empty query.
 */
export function countMatchingTreeNodes(
  roots: readonly OntologyTreeNode[],
  query: string,
): number {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return 0;
  let count = 0;
  const walk = (node: OntologyTreeNode): void => {
    if (knowledgeNodeMatchesQuery(node.node, trimmed)) count += 1;
    for (const child of node.children) walk(child);
  };
  for (const root of roots) walk(root);
  return count;
}

/**
 * Keeps only nodes matching the query while **preserving the parent chain**.
 *
 * Matching is lower-case containment on `node.title` or `node.id` (the
 * `kind:slug` form), so mixed Korean/English works. Developers read slugs daily
 * in frontmatter and code, so a slug search like 'mcp-server' must not come back
 * empty.
 *
 * Every ancestor of a match survives to keep the tree shape; non-matching
 * siblings are dropped; all descendants of a match are kept, because the user
 * expects to see the context.
 *
 * An empty query (or one empty after trimming) returns the input roots as they are.
 */
export function filterTreeByQuery(
  roots: readonly OntologyTreeNode[],
  query: string,
): OntologyTreeNode[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return roots.slice();

  function visit(node: OntologyTreeNode): OntologyTreeNode | null {
    const titleMatch = knowledgeNodeMatchesQuery(node.node, trimmed);
    const filteredChildren = node.children
      .map(visit)
      .filter((c): c is OntologyTreeNode => c !== null);

    if (titleMatch) {
      // A match: keep every descendant (the original children, not the filtered ones).
      return { ...node, children: node.children };
    }
    if (filteredChildren.length > 0) {
      // Only a descendant matched: this node survives purely as part of the parent chain.
      return { ...node, children: filteredChildren };
    }
    return null;
  }

  return roots
    .map(visit)
    .filter((n): n is OntologyTreeNode => n !== null);
}

/**
 * Drops nodes of the given `kind` together with their whole subtree. Used by the
 * general (non-developer) mode of the INDEX tree to hide element rows by
 * default. **The data is unchanged**: this prunes a derived display tree and
 * never touches `roots` or the graph. Counts and inventories must be computed
 * from the full graph rather than from this output — that is the caller's
 * responsibility, because a display filter must not distort a true number.
 *
 * Unlike `filterTreeByQuery` and `filterTreeByNodeIds` it does **not** preserve
 * the ancestor chain: if an excluded kind is itself an ancestor (uncommon), the
 * entire subtree disappears. Pure and deterministic.
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

/**
 * Keeps only nodes in the given id set while **preserving the parent chain** —
 * the tree scoping behind "show only what changed".
 *
 * Same algorithm as `filterTreeByQuery` with two differences:
 *   1. Matching is `ids.has(node.id)` (added or changed nodes), not string
 *      containment.
 *   2. Descendants of a match are **not all kept** — only matching ones — so
 *      unchanged siblings and children are not dragged in as noise. The result is
 *      the minimal tree of changed nodes plus their ancestor paths.
 *
 * An empty `ids` returns an empty array (nothing changed; the caller shows a hint).
 */
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

    // Keep a node that changed, or an ancestor of one that did. In both cases
    // descendants are the filtered set — even a match hides its unchanged children.
    if (match || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    return null;
  }

  return roots
    .map(visit)
    .filter((n): n is OntologyTreeNode => n !== null);
}
