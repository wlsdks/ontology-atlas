/**
 * The reading measure as a number for three consumers that cannot read the CSS token: the popout
 * window (an inlined stylesheet outside the app's cascade), the image `sizes=` hint (parsed at
 * build time) and the outline-rail fit (arithmetic). Each follows text zoom; the `_PX` values
 * are the default-root numbers, held to the token by tests/e2e/prose-measure-calibration.spec.ts.
 */

/** Mirrors `--measure-prose-steps`; change both together. */
export const PROSE_MEASURE_STEPS = 66;

/**
 * Advance of `0` in Pretendard Variable, in `em`, measured in the built export.
 * Mirrors `--measure-zero-advance`: `ch` is font-relative and a box cannot be.
 */
export const PROSE_ZERO_ADVANCE_EM = 0.5957;

/**
 * The `--text-reading` size at the default 16px root (`docs/DECISIONS.md`, "The reading column
 * is worth more of its pane than the measure was buying"). A root-size assumption: for the
 * column on screen call `docColumnPxAtRoot` with the live root size.
 */
export const DOC_BODY_FONT_PX = 16;

/** The side inset a document column pairs with (`px-6 md:px-10` at md and above). */
export const DOC_COLUMN_GUTTER_PX = 40;

/** The measure in rem (66 × 0.5957), for consumers that can express a length in `rem`. */
export const PROSE_MEASURE_REM = PROSE_MEASURE_STEPS * PROSE_ZERO_ADVANCE_EM;


/**
 * Not exported: gates assert the line cap as a ratio, because `1ch` depends on the rendering
 * face and a pinned pixel would be a font assertion.
 */
function proseMeasurePxAtRoot(rootFontPx: number): number {
  return PROSE_MEASURE_REM * rootFontPx;
}

/** The measure at that root plus one absolute gutter each side. */
export function docColumnPxAtRoot(rootFontPx: number): number {
  return proseMeasurePxAtRoot(rootFontPx) + 2 * DOC_COLUMN_GUTTER_PX;
}

export const PROSE_MEASURE_PX = proseMeasurePxAtRoot(DOC_BODY_FONT_PX);

export const DOC_COLUMN_PX = docColumnPxAtRoot(DOC_BODY_FONT_PX);
