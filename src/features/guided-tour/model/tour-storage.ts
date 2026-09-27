/**
 * localStorage helpers for the tour's completed/aborted state, like
 * `first-run-starter/model/sample-node-hint.ts`. No intermediate step is saved, and completion
 * never blocks a rerun from the entry tile.
 */
export const GUIDED_TOUR_STATUS_KEY = "guided-tour:v1";

export type GuidedTourStatus = "done" | "skipped";

/**
 * Separate from the map's `guided-tour:v1`, so seeing one screen's guide does not swallow the
 * others.
 */
export function destinationTourStatusKey(destination: string): string {
  return `guided-tour:${destination}:v1`;
}

export function writeGuidedTourStatus(
  status: GuidedTourStatus,
  key: string = GUIDED_TOUR_STATUS_KEY,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, status);
  } catch {
    /* Private mode: skip. */
  }
}

/**
 * `null` when absent or unrecognized; HomePage does not auto-raise again once done or skipped.
 */
export function readGuidedTourStatus(
  key: string = GUIDED_TOUR_STATUS_KEY,
): GuidedTourStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    return value === "done" || value === "skipped" ? value : null;
  } catch {
    return null;
  }
}
