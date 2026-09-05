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
 * Until this change the rail was gated by `min-[1440px]` / `min-[1536px]` media
 * queries — the viewport minus a **constant** 344px of chrome (rail 64 + sidebar 280).
 * That constant held for exactly one layout. The moment a right-hand dock opens, the
 * chrome is no longer 344: measured in the installed app at 1512 with the agent dock
 * open, the reading pane fell from 1168px to 748px while the media query still said
 * "1512 ≥ 1440, draw the rail" — so a 168px rail was drawn over a body whose glyphs
 * reached within 34px of the pane's right edge. The overlap was not a spacing bug; the
 * gate was reading a number that had stopped describing the thing it gated.
 *
 * The arithmetic, now stated in the quantity that actually decides it. The body is
 * `mx-auto max-w-[760px]` with 40px of its own side padding, so inside a pane of width
 * `W` the distance from the pane's right edge to the right-hand glyph edge is
 * `(W − 680) / 2`. The rail is drawn `right-6` (24px in) and is `width` wide, so it
 * clears the text only while:
 *
 *     (W − 680) / 2  ≥  24 + width + clearance
 *
 * | rail | clearance | pane floor | the viewport it used to mean |
 * |---|---|---|---|
 * | 168px | 16px | **1096px** | 1440 (1096 + 344 of chrome) |
 * | 200px | 32px | **1192px** | 1536 (1192 + 344) |
 *
 * The floors are the same numbers the media queries encoded — this changes *what* is
 * measured, not how much room the rail asks for. With no dock open the two agree
 * exactly; with one open, only this one is still true.
 */
export const OUTLINE_RAIL_NARROW_PANE_MIN = 1096;
export const OUTLINE_RAIL_WIDE_PANE_MIN = 1192;

export type OutlineRailFit = "hidden" | "narrow" | "wide";

export function resolveOutlineRailFit(paneWidth: number): OutlineRailFit {
  if (paneWidth >= OUTLINE_RAIL_WIDE_PANE_MIN) return "wide";
  if (paneWidth >= OUTLINE_RAIL_NARROW_PANE_MIN) return "narrow";
  return "hidden";
}
