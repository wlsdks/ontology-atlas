export type TopologyFocusReturnTarget = "row" | "search" | "tab";

function focusIfPossible(element: HTMLElement | null): boolean {
  if (!element) return false;
  element.focus({ preventScroll: true });
  return element.ownerDocument.activeElement === element;
}

/**
 * Restores the keyboard navigation context after the node datasheet closes.
 *
 * The selected row wins when it is still visible under the current INDEX filter.
 * If following a connection pushed the row out of the filter, focus falls to the
 * search field; if a canvas selection collapsed INDEX, it falls further to the
 * INDEX tab, which can reopen it.
 */
export function restoreTopologyFocusAfterDatasheetClose(
  selectedNodeId: string | null,
  root: ParentNode = document,
): TopologyFocusReturnTarget | null {
  if (selectedNodeId) {
    const rows = root.querySelectorAll<HTMLElement>("[data-index-row]");
    for (const row of rows) {
      if (
        row.dataset.indexRow === selectedNodeId &&
        focusIfPossible(row)
      ) {
        return "row";
      }
    }
  }

  const search = root.querySelector<HTMLElement>(
    '[data-testid="topology-index-search"]',
  );
  if (focusIfPossible(search)) return "search";

  const tab = root.querySelector<HTMLElement>(
    '[data-testid="topology-index-tab"]',
  );
  if (focusIfPossible(tab)) return "tab";

  return null;
}
