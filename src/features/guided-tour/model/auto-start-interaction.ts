import { canAutoStartGuidedTour } from "./auto-start-guard";

/**
 * The **interaction cancel** guard for the first-visit automatic tour.
 *
 * Automatic firing waits for the screen to settle (an initial 900ms plus retries
 * until the blockage clears), so the real firing moment can be two to six seconds
 * later. If in that window the user has already clicked a node and opened the detail
 * panel, a belated 1/7 card cuts in over their work (measured screenshot,
 * 2026-07-26). To someone who began exploring on their own, a step 1 saying "this is
 * the map" is interference, not guidance.
 *
 * So rather than adding one more guard, **the firing itself is cancelled**. Adding
 * exceptions to the firing conditions has already proven counterproductive — the
 * guidance covered the very choices it meant to introduce. Cancelling blocks no
 * path: the tour can be reopened at any time from Settings › screen guidance ›
 * replay and from the compass tile at the map's top right.
 *
 * Input while a modal is up (the folder guidance sheet, say) does not count as
 * interaction — pressing the sheet's [later] means "I finished the guidance", not "I
 * started exploring", and right after that is exactly where the tour belongs. The
 * verdict reuses the firing guard (`canAutoStartGuidedTour`) so the two cannot diverge.
 */
export interface WatchGuidedTourAutoStartCancelOptions {
  /** What to attach the events to. Defaults to `window` (injectable for tests). */
  target?: Pick<Window, "addEventListener" | "removeEventListener">;
  /** The document used for the modal verdict. Defaults to the global `document` (injectable for tests). */
  doc?: Document;
}

/** Pure modifier keys that carry no value — pressing only these is not the start of exploration. */
const MODIFIER_ONLY_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "OS",
]);

/**
 * Watches for the user's first substantive interaction while the automatic tour is
 * waiting to fire. On detection it calls `onCancel` **exactly once** and detaches
 * itself. The return value is a manual detach (called on a successful firing or unmount).
 */
export function watchGuidedTourAutoStartCancel(
  onCancel: () => void,
  options: WatchGuidedTourAutoStartCancelOptions = {},
): () => void {
  const target = options.target ?? (typeof window === "undefined" ? null : window);
  if (!target) return () => undefined;
  const doc = options.doc ?? (typeof document === "undefined" ? null : document);
  if (!doc) return () => undefined;

  let detached = false;
  const detach = () => {
    if (detached) return;
    detached = true;
    target.removeEventListener("pointerdown", handlePointerDown, true);
    target.removeEventListener("keydown", handleKeyDown, true);
  };

  const fire = () => {
  // If firing is blocked at this moment (a modal is up, the document lost focus), that
  // input is a conversation with that surface rather than map exploration — do not count it.
    if (!canAutoStartGuidedTour(doc)) return;
    detach();
    onCancel();
  };

  function handlePointerDown() {
    fire();
  }
  function handleKeyDown(event: Event) {
    const key = (event as KeyboardEvent).key;
    if (typeof key === "string" && MODIFIER_ONLY_KEYS.has(key)) return;
    fire();
  }

  // Capture — detects even when the map canvas stops the event at its own level.
  target.addEventListener("pointerdown", handlePointerDown, true);
  target.addEventListener("keydown", handleKeyDown, true);
  return detach;
}
