/**
 * The guided tour's completed/aborted state — pure localStorage read/write helpers,
 * mirroring the `first-run-starter/model/sample-node-hint.ts` pattern (injectable
 * key, private-mode try/catch fallback).
 *
 * No intermediate step is saved — it is a two-minute tour, so re-entry always starts
 * from the beginning. The completion flag does not block a rerun: the entry tile
 * always works.
 */
export const GUIDED_TOUR_STATUS_KEY = "guided-tour:v1";

export type GuidedTourStatus = "done" | "skipped";

/**
 * The per-destination "seen" key. It must be separate from the map's
 * (`guided-tour:v1`) so someone who has seen the docs guidance still gets the
 * workshop's — bundling them lets whichever screen was entered first swallow the
 * guidance of the other five.
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
    /* private mode — skip */
  }
}

/**
 * Reads the stored completed/aborted state — `null` when absent or unrecognized. The
 * first-visit auto-start verdict (HomePage) uses it for "if done or skipped was ever
 * recorded, do not auto-raise again".
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
