import { DOC_COLUMN_PX } from "@/shared/ui/reading-measure";

/** The outline rail's verdicts: how many headings earn it and how wide the pane must be. */

/**
 * Gated on the heading count so the always-on rail does not become noise on a short
 * document.
 */
export const OUTLINE_RAIL_MIN_HEADINGS = 4;

export function shouldShowOutlineRail(headingCount: number): boolean {
  return headingCount >= OUTLINE_RAIL_MIN_HEADINGS;
}

/**
 * Gated on the pane's width, not the window's, because a dock shrinks the pane. The rail stands one
 * gap past the column, so the floor is W >= C + gap + railWidth + 2 * minGutter.
 */

/** Space between the column's right edge and the rail's left edge. */
export const OUTLINE_RAIL_COLUMN_GAP = 32;

/** Smallest gutter outside the column and the rail; equal on both sides by construction. */
const OUTLINE_RAIL_MIN_GUTTER = 48;

/** The two widths the rail wears. `DocReadingOutlineRail` reads these rather than repeating them. */
export const OUTLINE_RAIL_NARROW_WIDTH = 168;
export const OUTLINE_RAIL_WIDE_WIDTH = 200;

/** Literal classes because Tailwind emits utilities only for literal names in source. */
export const OUTLINE_RAIL_WIDTH_CLASS = {
  narrow: "w-[168px]",
  wide: "w-[200px]",
} as const;

/**
 * The lane reserved on the rail's side: gap plus rail width (200 = 32 + 168, 232 = 32 + 200);
 * asserted in `outline-rail.test.ts`.
 */
export const OUTLINE_RAIL_LANE_CLASS = {
  narrow: "pr-[200px]",
  wide: "pr-[232px]",
} as const;

/** The rail's left offset from the pane centre: `50% + column/2 - (lane/2 - gap)`. */
export const OUTLINE_RAIL_LEFT_CLASS = {
  narrow: "left-[calc(50%_+_var(--measure-doc-column)_/_2_-_68px)]",
  wide: "left-[calc(50%_+_var(--measure-doc-column)_/_2_-_84px)]",
} as const;

/**
 * `columnPx` is an argument because text-only zoom changes the rendered column; `useOutlineRailFit`
 * passes the live value.
 */
export function outlineRailPaneFloor(railWidth: number, columnPx: number = DOC_COLUMN_PX): number {
  return Math.ceil(
    columnPx + OUTLINE_RAIL_COLUMN_GAP + railWidth + 2 * OUTLINE_RAIL_MIN_GUTTER,
  );
}

export const OUTLINE_RAIL_NARROW_PANE_MIN = outlineRailPaneFloor(OUTLINE_RAIL_NARROW_WIDTH);
export const OUTLINE_RAIL_WIDE_PANE_MIN = outlineRailPaneFloor(OUTLINE_RAIL_WIDE_WIDTH);

export type OutlineRailFit = "hidden" | "narrow" | "wide";

export function resolveOutlineRailFit(
  paneWidth: number,
  columnPx: number = DOC_COLUMN_PX,
): OutlineRailFit {
  if (paneWidth >= outlineRailPaneFloor(OUTLINE_RAIL_WIDE_WIDTH, columnPx)) return "wide";
  if (paneWidth >= outlineRailPaneFloor(OUTLINE_RAIL_NARROW_WIDTH, columnPx)) return "narrow";
  return "hidden";
}
