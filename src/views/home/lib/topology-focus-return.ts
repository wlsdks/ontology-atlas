export type TopologyFocusReturnTarget = "row" | "search" | "tab";

function focusIfPossible(element: HTMLElement | null): boolean {
  if (!element) return false;
  element.focus({ preventScroll: true });
  return element.ownerDocument.activeElement === element;
}

/**
 * The selected row wins while INDEX still shows it; else focus falls to the search field, and to
 * the INDEX tab when a canvas selection collapsed INDEX.
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

/** Where the browser drops focus when the focused element unmounts. */
function focusWasDropped(doc: Document = document): boolean {
  const active = doc.activeElement;
  return active === null || active === doc.body;
}

/**
 * Only a dropped focus moves, so a person who clicked elsewhere keeps it. Returns whether focus
 * landed.
 */
export function returnFocusIfDropped(testId: string, doc: Document = document): boolean {
  if (!focusWasDropped(doc)) return false;
  return focusIfPossible(doc.querySelector<HTMLElement>(`[data-testid="${testId}"]`));
}

/** Not inside an exiting (inert) frame. */
function findReachable(testIds: readonly string[], doc: Document): HTMLElement | null {
  for (const testId of testIds) {
    for (const el of doc.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)) {
      if (el.closest("[inert]") || el.closest('[aria-hidden="true"]')) continue;
      if (el.getClientRects().length === 0) continue;
      return el;
    }
  }
  return null;
}

function focusIsStranded(doc: Document, leaving: Element | null): boolean {
  const active = doc.activeElement;
  if (active === null || active === doc.body) return true;
  if (leaving !== null && (active === leaving || leaving.contains(active))) return true;
  return active.closest("[inert]") !== null;
}

/**
 * Hands focus to the first of `testIds` once it mounts, waiting up to `frames` frames. Only a
 * stranded focus moves (on `<body>`, in an inert frame, or still on `leaving`), so a person who
 * moved on keeps their place. Returns a cancel function.
 */
export function focusWhenReady(
  testIds: readonly string[],
  options: { leaving?: Element | null; frames?: number; doc?: Document } = {},
): () => void {
  const doc = options.doc ?? document;
  const win = doc.defaultView;
  if (!win) return () => {};
  const leaving = options.leaving ?? null;
  let remaining = options.frames ?? 45;
  let handle = 0;
  const tick = () => {
    if (!focusIsStranded(doc, leaving)) return;
    const target = findReachable(testIds, doc);
    if (target && target !== leaving && focusIfPossible(target)) return;
    remaining -= 1;
    if (remaining > 0) handle = win.requestAnimationFrame(tick);
  };
  handle = win.requestAnimationFrame(tick);
  return () => win.cancelAnimationFrame(handle);
}
