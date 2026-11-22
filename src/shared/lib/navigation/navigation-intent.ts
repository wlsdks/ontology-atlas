/**
 * Standing loops (the map's rAF) yield frames once navigation starts, so the incoming screen gets
 * the budget. Only the fact that navigation started travels, so map and rail stay unaware of each
 * other; listeners release themselves after a deadline.
 */

export const NAVIGATION_INTENT_EVENT = "ontology-atlas:navigation-intent";

/**
 * How long a standing loop yields frames after the signal. The slowest observed transition under 4x
 * throttling was 745ms. A successful navigation unmounts the map, so this cap only applies to a
 * cancelled one, and a single pointer move over the canvas releases it at once.
 */
export const NAVIGATION_YIELD_MS = 900;

/** Announce that navigation is starting; call it immediately before the client navigation. A no-op on the server and during prerender. */
export function signalNavigationIntent(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NAVIGATION_INTENT_EVENT));
}
