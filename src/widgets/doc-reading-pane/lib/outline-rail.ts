import { DOC_COLUMN_PX } from "@/shared/ui/reading-measure";

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
 * one gap. Clearance is therefore **constructed, not checked**, and the only question left is
 * whether the rail *fits* beside the column.
 *
 * ## The rail owns a lane; it no longer eats one gutter twice (2026-09-12)
 *
 * Until 2026-09-12 the column was centred in the **whole** pane and the rail lived in the
 * right-hand half of what the centring left over. The pane therefore had to be wide enough
 * for the rail *and* for a mirror of the rail on the other side:
 *
 *     W  ≥  C + 2 × (gutter + railWidth + trailing reserve)
 *
 * At `C = 580.4` that was 1045 / 1109 and a 1168px pane cleared it. At `C = 709.1` — the
 * measure the owner asked for on 2026-09-12 — the same form asks for **1174 / 1238**, so the
 * rail would have vanished from a 1512 window with no dock. Nothing about the rail had
 * changed; the arithmetic was paying for the lane twice.
 *
 * So the lane is reserved once, on the side it is actually on. `DocReadingPane` gives the
 * scroller `padding-right: gap + railWidth`, the column centres in what is left, and the rail
 * stands one gap past the column's right edge. The composition is
 * `[gutter] [column] [gap] [rail] [gutter]` with the two outer gutters equal **by
 * construction** — which is why the old trailing reserve is now a minimum *gutter* and the
 * floor is:
 *
 *     W  ≥  C + gap + railWidth + 2 × minGutter
 *
 * | rail | floor at C=580.4 (2026-09-11) | floor now, C=709.1 |
 * |---|---|---|
 * | 168px | 1045 | **1006** |
 * | 200px | 1109 | **1038** |
 *
 * Measured consequence at 1512 with no dock (pane 1168, `wide`): the column's own text runs
 * 497.5 → 1126.5 where it ran 677.8 → 1177.8, the left void falls from 334px to 153px, and the
 * rail's glyphs move from 1270 to 1211. The rail keeps the 200px tier it gained in 2026-09-11.
 *
 * Every number comes from `src/shared/ui/reading-measure.ts`, from the gap below, or from the
 * two rail widths; none is a fresh literal.
 */

/**
 * The distance between the column's right edge and the rail's left edge.
 *
 * It was `--measure-doc-gutter` (40) while the rail was one gutter past the column. It is its
 * own number now because it is a different quantity: 40 is the inset *inside* the column's box,
 * and this is the space *between* two boxes. 32 is the step the brief for this slice asked for
 * and the one the pane composition is measured at.
 */
export const OUTLINE_RAIL_COLUMN_GAP = 32;

/**
 * The smallest gutter the composition leaves outside the column and outside the rail.
 *
 * The two are equal by construction — reserving the lane on one side only makes the leftover
 * split evenly — so this single floor answers both. It was a 24px *trailing* reserve while the
 * rail hung off the pane's right edge; 48 is what the slice's composition asks for and what
 * keeps the column clear of the pane's own edge at the floor.
 */
const OUTLINE_RAIL_MIN_GUTTER = 48;

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

/**
 * The lane the pane reserves on the rail's side: one gap plus the rail's own width.
 *
 * `200 = 32 + 168` and `232 = 32 + 200`. Literals for the same reason the widths above are —
 * Tailwind emits a utility only for a class name it can find written out — and asserted
 * against the constants in `outline-rail.test.ts` so the pair cannot drift.
 */
export const OUTLINE_RAIL_LANE_CLASS = {
  narrow: "pr-[200px]",
  wide: "pr-[232px]",
} as const;

/**
 * Where the rail stands, as an offset from the **pane's** centre.
 *
 * The rail is absolutely positioned in the pane, while the column is centred in the pane
 * *minus the lane* — so the column's centre is half a lane left of the pane's, and the rail's
 * left edge is `50% − lane/2 + column/2 + gap`. Folded: `50% + column/2 − (lane/2 − gap)`,
 * i.e. −68px narrow (100 − 32) and −84px wide (116 − 32).
 */
export const OUTLINE_RAIL_LEFT_CLASS = {
  narrow: "left-[calc(50%_+_var(--measure-doc-column)_/_2_-_68px)]",
  wide: "left-[calc(50%_+_var(--measure-doc-column)_/_2_-_84px)]",
} as const;

/**
 * The pane width at which a rail of `railWidth` first fits one gap past the column.
 *
 * ⚠️ **`columnPx` is an argument because the column is no longer one number** (2026-09-12).
 * `--measure-doc-column` is derived from `--text-reading`, and the type ramp is written in
 * `rem`, so a browser's text-only zoom moves the rendered column: 709.1px at the 16px root,
 * 1338.1px at a 32px one (both measured). The rail's *position* was already expressed against
 * the token (`OUTLINE_RAIL_LEFT_CLASS`), so it followed the zoom on its own — while a floor
 * computed from the 100% number went on saying "wide fits" to a 1168px pane whose column had
 * grown to 1338. That is the 2026-09-06 overlap defect this file exists to prevent, reached
 * through the font setting instead of through a dock. `useOutlineRailFit` passes the column at
 * the live root; the default keeps every existing caller and test on the 100% value.
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
