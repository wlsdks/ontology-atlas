/**
 * Standing loops (the map's rAF) yield frames once navigation starts, so the incoming screen gets
 * the budget. Only the fact that navigation started travels, so map and rail stay unaware of each
 * other; listeners release themselves after a deadline.
 */

/** Navigation started (a window event). */
export const NAVIGATION_INTENT_EVENT = "ontology-atlas:navigation-intent";

/**
 * How long a standing loop yields frames after the signal.
 *
 * Chosen from the measurement above: the slowest observed transition under 4×
 * throttling was 745ms, so this leaves headroom — but not so much that a person
 * would notice the pause when navigation *does not* happen. In practice a
 * successful navigation unmounts the map, so this cap only ever applies to a
 * cancelled one, and a single pointer move over the canvas releases it at once.
 */
export const NAVIGATION_YIELD_MS = 900;

/**
 * Announce that navigation is starting. Call it **immediately before the client
 * navigation**. A no-op on the server and during prerender — with static export
 * that path is actually taken.
 */
export function signalNavigationIntent(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NAVIGATION_INTENT_EVENT));
}
