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

/**
 * Whether the keyboard has nowhere to stand: focus is on `<body>` (or nothing),
 * which is where the browser drops it when the focused element unmounts.
 */
function focusWasDropped(doc: Document = document): boolean {
  const active = doc.activeElement;
  return active === null || active === doc.body;
}

/**
 * Hands focus to `testId` when a closing surface dropped it on `<body>`.
 *
 * Only a dropped focus is moved: a person who clicked somewhere else while the
 * surface closed keeps what they clicked. Returns whether focus landed.
 */
export function returnFocusIfDropped(testId: string, doc: Document = document): boolean {
  if (!focusWasDropped(doc)) return false;
  return focusIfPossible(doc.querySelector<HTMLElement>(`[data-testid="${testId}"]`));
}

/** The first live, reachable element among `testIds`: not inside an exiting (inert) frame. */
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

/** Focus is nowhere a keyboard can continue from: `<body>`, or inside a frame on its way out. */
function focusIsStranded(doc: Document, leaving: Element | null): boolean {
  const active = doc.activeElement;
  if (active === null || active === doc.body) return true;
  if (leaving !== null && (active === leaving || leaving.contains(active))) return true;
  return active.closest("[inert]") !== null;
}

/**
 * **Hands focus to the first of `testIds` once it exists**, for a surface that just closed or
 * swapped (interaction audit, 2026-09-25: closing the add-to-map and create dialogs, full
 * detail, the tour, and folding INDEX all left focus on `<body>`).
 *
 * The target often mounts a few frames later (INDEX swaps frames on a transition; a panel
 * mounts after the selection settles), so this waits frame by frame, up to `frames`. It only
 * moves a focus that is stranded — on `<body>`, inside an inert frame, or still on `leaving`
 * (the control that started it) — so a person who has already moved on keeps where they went.
 * Returns a cancel function.
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
