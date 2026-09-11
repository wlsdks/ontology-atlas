import { DOC_COLUMN_GUTTER_PX, DOC_COLUMN_PX } from "@/shared/ui/reading-measure";

/**
 * The outline rail's two verdicts — how many headings earn it, and how wide the
 * reading pane must be before it can stand beside the text instead of on top of it.
 *
 * Both are pure, so the arithmetic can be tested without a browser.
 */

/**
 * Gated on the heading count so the always-on rail does not become noise on a short
 * document.
 */
export const OUTLINE_RAIL_MIN_HEADINGS = 4;

export function shouldShowOutlineRail(headingCount: number): boolean {
  return headingCount >= OUTLINE_RAIL_MIN_HEADINGS;
}

/**
 * ⚠️ **The threshold is the pane's width, not the window's** (measured 2026-09-06).
 *
 * Until that change the rail was gated by `min-[1440px]` / `min-[1536px]` media queries —
 * the viewport minus a **constant** 344px of chrome (rail 64 + sidebar 280). That constant
 * held for exactly one layout. The moment a right-hand dock opens, the chrome is no longer
 * 344: measured in the installed app at 1512 with the agent dock open, the reading pane fell
 * from 1168px to 748px while the media query still said "1512 ≥ 1440, draw the rail" — so a
 * 168px rail was drawn over a body whose glyphs reached within 34px of the pane's right edge.
 * The overlap was not a spacing bug; the gate was reading a number that had stopped
 * describing the thing it gated.
 *
 * ## What the arithmetic answers changed on 2026-09-11
 *
 * The old form asked **"will the rail clear the text?"**, because the rail was pinned to the
 * pane's right edge (`right-6`) and the text's position was whatever a centred 760px column
 * left behind. That made the distance between the two a *residue of the pane's width*:
 * measured in the installed app at 1512, the last glyph sat 65px from the rail — and when the
 * reading line was capped at the prose measure, the same rail stayed at exactly x=1322 while
 * the text pulled back to 1083. Nothing moved; the hole was 239px because the rail was never
 * holding a relationship to the column at all.
 *
 * The rail is now positioned from the column: its left edge is the column's right edge plus
 * `--measure-doc-gutter`. Clearance is therefore **constructed, not checked**, and the only
 * question left is whether the rail *fits* between the column and the pane's right edge. With
 * the column centred (`mx-auto`) the space on that side is `(W − C) / 2`, so:
 *
 *     (W − C) / 2  ≥  gutter + railWidth + trailing reserve
 *     W  ≥  C + 2 × (gutter + railWidth + trailing reserve)
 *
 * | rail | floor before (clear the text) | floor now (fit beside the column) |
 * |---|---|---|
 * | 168px | 1096 | **1045** |
 * | 200px | 1192 | **1109** |
 *
 * Both floors fall, because a rail that starts one gutter past the column needs less room
 * than one that had to clear a 680px content run centred in the pane. The consequence is
 * reported rather than tuned: a pane of 1168 (a 1512 window with no dock) was `narrow` before
 * and is `wide` now, so the rail there is 200px instead of 168.
 *
 * Every number comes from `src/shared/ui/reading-measure.ts` or from the two rail widths
 * below; none is a fresh literal.
 */

/**
 * The rail's own trailing breathing room against the pane's right edge. It was the `right-6`
 * the rail used to be anchored by; with the rail anchored to the column instead, the same 24px
 * survives as the reserve the fit arithmetic keeps free on that side.
 */
const OUTLINE_RAIL_TRAILING_RESERVE = 24;

/** The two widths the rail wears. `DocReadingOutlineRail` reads these rather than repeating them. */
export const OUTLINE_RAIL_NARROW_WIDTH = 168;
export const OUTLINE_RAIL_WIDE_WIDTH = 200;

/**
 * The same two widths as classes, beside the numbers the fit floors are computed from — so a
 * change cannot move one without the other. They are literals because Tailwind emits a utility
 * only for a literal it can find in source; this file is scanned like any other.
 */
export const OUTLINE_RAIL_WIDTH_CLASS = {
  narrow: "w-[168px]",
  wide: "w-[200px]",
} as const;

/** The pane width at which a rail of `railWidth` first fits one gutter past the column. */
export function outlineRailPaneFloor(railWidth: number): number {
  return Math.ceil(
    DOC_COLUMN_PX + 2 * (DOC_COLUMN_GUTTER_PX + railWidth + OUTLINE_RAIL_TRAILING_RESERVE),
  );
}

export const OUTLINE_RAIL_NARROW_PANE_MIN = outlineRailPaneFloor(OUTLINE_RAIL_NARROW_WIDTH);
export const OUTLINE_RAIL_WIDE_PANE_MIN = outlineRailPaneFloor(OUTLINE_RAIL_WIDE_WIDTH);

export type OutlineRailFit = "hidden" | "narrow" | "wide";

export function resolveOutlineRailFit(paneWidth: number): OutlineRailFit {
  if (paneWidth >= OUTLINE_RAIL_WIDE_PANE_MIN) return "wide";
  if (paneWidth >= OUTLINE_RAIL_NARROW_PANE_MIN) return "narrow";
  return "hidden";
}
