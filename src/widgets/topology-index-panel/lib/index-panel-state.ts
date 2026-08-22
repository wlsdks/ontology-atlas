/**
 * INDEX panel expanded/collapsed state contract (「B3 허브가 곧 지도」 — the hub is
 * the map).
 *
 * The state has two independent sources — a `?index=` URL param (deep-link
 * intent, e.g. `/ontology/` redirecting with `index=expanded`) and a
 * localStorage preference (the user's last explicit toggle). Neither is a
 * React concern by itself; this module is the pure "which one wins" contract
 * so the merge logic is unit-testable without mounting HomePage.
 *
 * Precedence: URL param (when present and valid) > stored preference > the
 * "expanded" default (INDEX is the new default left occupant on /topology —
 * see docs/prototypes/hub-b3-immersive.html).
 */

export type IndexPanelState = "expanded" | "collapsed";

const VALID_STATES: readonly IndexPanelState[] = ["expanded", "collapsed"];

/** Parses the `?index=` URL param. Anything other than the two valid literal
 * values is treated as "not specified" (null) rather than an error — deep
 * links from older tooling or typos degrade to the default, not a crash. */
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
