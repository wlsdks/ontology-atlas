/**
 * Navigation-intent signal — "I am leaving this screen, yield the frame budget".
 *
 * **Why (measured 2026-08-19).** How long a new screen took to appear after a rail
 * tap **depended on where you left from**. From a quiet screen it was 90–200ms
 * under 4× throttling; from an active map:
 *
 * | Departing state                       | Time to docs |
 * |---------------------------------------|--------------|
 * | 2D, 2,000 nodes                       | 194ms        |
 * | **3D, 2,000 nodes (dome auto-rotating)** | **529ms**  |
 * | **3D, 3,000 nodes**                   | **745ms**    |
 *
 * The new screen is not slow. The map's rAF loop repaints in full every frame
 * **right up to the moment it unmounts**, so the incoming screen's first render
 * competes with those frames for the budget. The user has already said "I am
 * leaving", which makes those frames **pictures nobody will see**.
 *
 * **Why this shape.** The map must not know about the nav rail (a widget knowing
 * about chrome is the reverse of the FSD import direction), and the rail must not
 * know about the map's loop. So **the only thing both know is that navigation
 * started**, and that alone travels as a shared-layer event. Any future surface
 * with a standing loop subscribes to the same signal.
 *
 * **It releases itself — there is no freeze failure mode.** A listener records a
 * deadline for how long to yield and returns on its own once it passes. Even if
 * navigation is cancelled (press-and-drag-away, or a router no-op because the
 * address is unchanged), the map cannot stop forever — the same reasoning behind
 * `idle-gate.ts` being designed without wake wiring.
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
