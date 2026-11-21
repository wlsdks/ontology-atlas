import type { LibrarySourceRow } from "@/entities/docs-vault";

export type SourceState = LibrarySourceRow["state"];

/** Every bar, legend and word list runs in this order: done, then what waits, then what is unknown. */
export const SOURCE_STATE_ORDER = [
  "compiled",
  "partial",
  "stale",
  "checking",
  "unreadable",
  "not-compiled",
] as const satisfies readonly SourceState[];

export const SOURCE_STATE_COUNT = SOURCE_STATE_ORDER.length;

const STATE_INDEX: Readonly<Record<SourceState, number>> = Object.fromEntries(
  SOURCE_STATE_ORDER.map((state, index) => [state, index]),
) as Record<SourceState, number>;

export function sourceStateIndex(state: SourceState): number {
  return STATE_INDEX[state];
}

/** One ink per state, shared by the band, the row bars, the legend, the index list's dots and the panel's words. */
export const SOURCE_STATE_INK: Readonly<Record<SourceState, string>> = {
  compiled: "var(--color-source-page)",
  partial: "var(--color-source-partial)",
  stale: "var(--color-source-review)",
  checking: "var(--color-source-checking)",
  unreadable: "var(--color-source-unreadable)",
  "not-compiled": "var(--color-source-none)",
};

/** The page ink once every source has a page. */
export const SOURCE_COMPLETE_INK = "var(--color-source-complete)";

/** Read in part sits beside indigo at a similar lightness, so hatching tells it apart without colour. */
export const SOURCE_PARTIAL_HATCH =
  "repeating-linear-gradient(135deg, var(--color-source-partial) 0 2px, var(--color-source-partial-a55) 2px 4px)";

/** The CSS `background` a state's segment wears. */
export function sourceStateFill(state: SourceState, complete = false): string {
  if (state === "compiled" && complete) return SOURCE_COMPLETE_INK;
  return state === "partial" ? SOURCE_PARTIAL_HATCH : SOURCE_STATE_INK[state];
}
