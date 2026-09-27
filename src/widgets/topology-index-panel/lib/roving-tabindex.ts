/**
 * Roving tabindex for the INDEX tree (WAI-ARIA `tree`): one Tab stop on the active row, arrow keys
 * inside. Pure functions tested in `roving-tabindex.test.ts`.
 */

import type { OntologyTreeNode } from "@/entities/knowledge-graph";

/**
 * Visible row ids in top-to-bottom order, skipping children of closed parents; `isOpen` is the
 * panel's own predicate.
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
 * Target of one arrow key: ArrowDown/Up clamp at the ends, Home/End go to the first or last; an
 * unknown current id lands on the first row, an empty list gives null.
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
 * The row holding tabIndex=0: a visible active row, else the visible selected node, else the first
 * row.
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
