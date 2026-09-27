import { canAutoStartGuidedTour } from "./auto-start-guard";

/**
 * Cancels the first-visit tour when the user starts exploring while it waits (900ms plus
 * retries, so up to seconds later), rather than adding firing exceptions. Replay stays in
 * Settings and on the map compass tile. Input while a modal is up does not count; the verdict
 * reuses `canAutoStartGuidedTour` so the two cannot diverge.
 */
export interface WatchGuidedTourAutoStartCancelOptions {
  /** Defaults to `window`. */
  target?: Pick<Window, "addEventListener" | "removeEventListener">;
  /** For the modal verdict; defaults to the global `document`. */
  doc?: Document;
}

/** Modifier keys alone do not start exploration. */
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
 * Calls `onCancel` exactly once on the first substantive interaction and detaches; returns a
 * manual detach for a successful firing or unmount.
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
  // While firing is blocked (a modal, lost focus) input belongs to that surface, not the map.
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

  // Capture, so it sees events the map canvas stops at its own level.
  target.addEventListener("pointerdown", handlePointerDown, true);
  target.addEventListener("keydown", handleKeyDown, true);
  return detach;
}
