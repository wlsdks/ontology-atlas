/**
 * INDEX expanded or collapsed state: URL `?index=` (deep-link intent) wins over the stored
 * preference, which wins over the "expanded" default (docs/prototypes/hub-b3-immersive.html). Pure
 * so the merge is testable without HomePage.
 */

export type IndexPanelState = "expanded" | "collapsed";

const VALID_STATES: readonly IndexPanelState[] = ["expanded", "collapsed"];

/**
 * Parses `?index=`; anything but the two literals is null so bad links fall back to the default.
 */
export function parseIndexPanelStateParam(
  raw: string | null | undefined,
): IndexPanelState | null {
  if (raw == null) return null;
  return (VALID_STATES as readonly string[]).includes(raw)
    ? (raw as IndexPanelState)
    : null;
}

/** Resolves the effective state from the two optional sources + default. */
export function resolveIndexPanelState(
  urlState: IndexPanelState | null,
  storedState: IndexPanelState | null,
): IndexPanelState {
  return urlState ?? storedState ?? "expanded";
}
