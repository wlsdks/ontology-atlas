/**
 * The INDEX tree's roving-tabindex contract (the WAI-ARIA `tree` pattern).
 *
 * `role="tree"` promises "one Tab enters the tree, arrow keys move inside it".
 * The previous implementation pinned `tabIndex=0` on every `role="treeitem"`
 * row, so expanding a single domain added 14 more tab stops and a keyboard user
 * had to step through the whole tree (accessibility audit P0). Roving tabindex
 * keeps `tabIndex=0` on the active row alone, `-1` on the rest, and lets
 * ArrowUp/Down handle sibling movement.
 *
 * This module isolates those movement rules as pure functions so they can be
 * unit-tested without DOM or React (`roving-tabindex.test.ts`). The panel
 * assembles these functions plus `ref.focus()`.
 */

import type { OntologyTreeNode } from "@/entities/knowledge-graph/lib/ontology-tree";

/**
 * Flatten the nodeIds of the rows actually visible on screen into top-to-bottom
 * DOM order. `isOpen` is the same predicate the panel uses (including the
 * auto-expand during search and lens modes) — children of a collapsed parent are
 * skipped. Arrow movement targets exactly this array.
 */
export function flattenVisibleRowIds(
  roots: readonly OntologyTreeNode[],
  isOpen: (nodeId: string) => boolean,
): string[] {
  const out: string[] = [];
  const visit = (entry: OntologyTreeNode) => {
    out.push(entry.node.id);
    if (entry.children.length > 0 && isOpen(entry.node.id)) {
      for (const child of entry.children) visit(child);
    }
  };
  for (const root of roots) visit(root);
  return out;
}

export type RovingNavKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/**
 * Decide which nodeId one arrow key should move the roving focus to.
 * - ArrowDown/Up: next/previous sibling, clamped at the boundary — no wrapping,
 *   per the tree convention.
 * - Home/End: first/last.
 * If currentId is outside the list (removed by a filter, say), it lands on the
 * first row. An empty list gives null.
 */
export function nextRovingId(
  orderedIds: readonly string[],
  currentId: string | null,
  key: RovingNavKey,
): string | null {
  if (orderedIds.length === 0) return null;
  const last = orderedIds.length - 1;
  if (key === "Home") return orderedIds[0];
  if (key === "End") return orderedIds[last];
  const index = currentId ? orderedIds.indexOf(currentId) : -1;
  if (index < 0) return orderedIds[0];
  if (key === "ArrowDown") return orderedIds[Math.min(index + 1, last)];
  return orderedIds[Math.max(index - 1, 0)]; // ArrowUp
}

/**
 * Resolve which row should be `tabIndex=0` — the tree's single Tab entry point.
 * Priority: a valid active row → the selected node (when both are visible) →
 * the first row. When the active or selected id is not currently visible
 * (filtered out or collapsed), it falls back to the first row, guaranteeing the
 * roving entry point always names a row that exists.
 */
export function resolveActiveRowId(
  orderedIds: readonly string[],
  activeRowId: string | null,
  selectedId: string | null,
): string | null {
  if (orderedIds.length === 0) return null;
  if (activeRowId && orderedIds.includes(activeRowId)) return activeRowId;
  if (selectedId && orderedIds.includes(selectedId)) return selectedId;
  return orderedIds[0];
}
