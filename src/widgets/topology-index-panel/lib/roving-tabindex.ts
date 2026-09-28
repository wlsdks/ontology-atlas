/**
 * Roving tabindex for the INDEX tree (WAI-ARIA `tree`): one Tab stop on the active row, arrow keys
 * inside. Pure functions tested in `roving-tabindex.test.ts`.
 */

import type { OntologyTreeNode } from "@/entities/knowledge-graph";
import { ROVING_PAGE_ROWS } from "@/shared/lib/use-roving-rows";

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

const ROVING_NAV_KEYS = ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"] as const;

export type RovingNavKey = (typeof ROVING_NAV_KEYS)[number];

export function isRovingNavKey(key: string): key is RovingNavKey {
  return (ROVING_NAV_KEYS as readonly string[]).includes(key);
}

const ROW_STEPS = {
  ArrowDown: 1,
  ArrowUp: -1,
  PageDown: ROVING_PAGE_ROWS,
  PageUp: -ROVING_PAGE_ROWS,
} as const;

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
  return orderedIds[Math.min(Math.max(index + ROW_STEPS[key], 0), last)];
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
