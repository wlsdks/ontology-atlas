import type { LibrarySourceRow } from "@/entities/docs-vault";

type SourceState = LibrarySourceRow["state"];

/** The bar's segments, left to right: what has a page, what waits with one, what is not yet known. */
export const PROGRESS_SEGMENTS = [
  { states: ["compiled"], ink: "var(--color-indigo-accent)" },
  { states: ["stale", "partial"], ink: "var(--color-status-warning)" },
  { states: ["checking", "unreadable"], ink: "var(--color-indigo-a40)" },
] as const satisfies ReadonlyArray<{ states: readonly SourceState[]; ink: string }>;

/** The bar's empty track: sources with no wiki page. */
export const PROGRESS_TRACK_INK = "var(--color-overlay-2)";
const COMPLETE_INK = "var(--color-status-success)";

/** The colour a state wears in the bar, so the state line's swatches map to it. */
export function progressInk(state: SourceState, complete = false): string {
  if (state === "compiled" && complete) return COMPLETE_INK;
  const segment = PROGRESS_SEGMENTS.find((candidate) => (candidate.states as readonly SourceState[]).includes(state));
  return segment?.ink ?? PROGRESS_TRACK_INK;
}

export { COMPLETE_INK as PROGRESS_COMPLETE_INK };
