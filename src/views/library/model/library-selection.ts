export type LibrarySelection = { kind: "wiki"; slug: string } | { kind: "source"; path: string } | { kind: "report" } | null;

export type LibraryHomeSurface = "guide" | "questions" | "compile" | "overflow" | null;

/**
 * Where focus goes when the selection changes. Leaving a page lands on the index's home row, the
 * row now selected, so the next press opens another page from the list; a folded or hidden index
 * hands that to the reader.
 */
export function librarySelectionFocusTarget({
  selected, mobileBrowseOpen, narrow, browseBack, reader, homeRow = null,
}: {
  selected: object | null;
  mobileBrowseOpen: boolean;
  narrow: boolean;
  browseBack: HTMLElement | null;
  reader: HTMLElement | null;
  homeRow?: HTMLElement | null;
}): HTMLElement | null {
  if (selected === null && mobileBrowseOpen && narrow && browseBack?.isConnected) return browseBack;
  if (selected === null && homeRow?.isConnected && homeRow.closest("[inert]") === null && homeRow.getClientRects().length > 0) return homeRow;
  return reader?.isConnected ? reader : null;
}
