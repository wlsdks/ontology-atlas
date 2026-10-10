export type LibrarySelection = { kind: "wiki"; slug: string } | { kind: "source"; path: string } | { kind: "report" } | null;

export type LibraryHomeSurface = "guide" | "questions" | "compile" | "overflow" | null;

export function librarySelectionFocusTarget({
  selected, mobileBrowseOpen, narrow, browseBack, reader,
}: {
  selected: object | null;
  mobileBrowseOpen: boolean;
  narrow: boolean;
  browseBack: HTMLElement | null;
  reader: HTMLElement | null;
}): HTMLElement | null {
  if (selected === null && mobileBrowseOpen && narrow && browseBack?.isConnected) return browseBack;
  return reader?.isConnected ? reader : null;
}
