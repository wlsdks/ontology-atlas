"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { OntologyTreeNode } from "@/entities/knowledge-graph";
import { useWindowedRows } from "@/shared/lib/use-windowed-rows";

/** A top-level row before it is measured: one step of the 36px control ladder. */
const ROOT_ROW_ESTIMATE_PX = 36;
/** Enough rows for a tall panel, so the first paint does not build hundreds that leave at once. */
const FIRST_RENDER_ROOTS = 40;

type RowAction = "focus" | "reveal";

function renderedRow(list: HTMLElement | null, nodeId: string): HTMLElement | null {
  for (const row of list?.querySelectorAll<HTMLElement>("[data-index-row]") ?? []) {
    if (row.dataset.indexRow === nodeId) return row;
  }
  return null;
}

function act(row: HTMLElement, action: RowAction): void {
  if (action === "focus") row.focus();
  else row.scrollIntoView?.({ block: "nearest" });
}

/**
 * Only the top-level rows in view are in the DOM (`useWindowedRows`): a folder with hundreds of
 * parentless concepts made the INDEX most of its page (492 top-level rows, 6,497 elements at
 * 12,000 concepts). A row outside the window is scrolled in before it is focused or revealed, and
 * the tab stop moves to a rendered row while its own is scrolled away. Open branches render whole.
 * A tuple, so the window stays a value and the ref a ref to the lint.
 */
export function useIndexRootWindow(roots: readonly OntologyTreeNode[]) {
  const [range, listRef, scrollToRoot] = useWindowedRows<HTMLDivElement>({
    count: roots.length,
    estimate: ROOT_ROW_ESTIMATE_PX,
    initialRows: FIRST_RENDER_ROOTS,
  });
  /** Every row's top-level ancestor, open or not; O(tree) once per tree. */
  const rootIndexById = useMemo(() => {
    const index = new Map<string, number>();
    roots.forEach((root, rootIndex) => {
      const stack = [root];
      while (stack.length > 0) {
        const entry = stack.pop() as OntologyTreeNode;
        if (index.has(entry.node.id)) continue;
        index.set(entry.node.id, rootIndex);
        stack.push(...entry.children);
      }
    });
    return index;
  }, [roots]);
  const pendingRef = useRef<{ nodeId: string; action: RowAction } | null>(null);

  const bringRow = useCallback(
    (nodeId: string, action: RowAction) => {
      const row = renderedRow(listRef.current, nodeId);
      if (row) {
        pendingRef.current = null;
        act(row, action);
        return;
      }
      const rootIndex = rootIndexById.get(nodeId);
      if (rootIndex === undefined) return;
      pendingRef.current = { nodeId, action };
      scrollToRoot(rootIndex);
    },
    [listRef, rootIndexById, scrollToRoot],
  );

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    const row = renderedRow(listRef.current, pending.nodeId);
    if (!row) return;
    pendingRef.current = null;
    act(row, pending.action);
  });

  /** The row that carries the tab stop: the active one, or the first rendered while it is not. */
  const tabStopFor = useCallback(
    (activeRowId: string | null): string | null => {
      if (activeRowId === null) return null;
      const rootIndex = rootIndexById.get(activeRowId);
      if (rootIndex === undefined || (rootIndex >= range.start && rootIndex < range.end)) return activeRowId;
      return roots[range.start]?.node.id ?? activeRowId;
    },
    [rootIndexById, roots, range.end, range.start],
  );

  return [range, listRef, bringRow, tabStopFor] as const;
}
