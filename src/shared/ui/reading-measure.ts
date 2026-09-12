/**
 * **The reading measure as a number, for the places a CSS variable cannot reach.**
 *
 * `app/globals.css` owns the measure. `--measure-prose` is the cap on a *line* and stays in
 * `ch`; `--measure-doc-column` is the *box* and is that same measure spent at
 * `--text-reading` plus one `--measure-doc-gutter` each side. Every rendered surface reads
 * those tokens and needs nothing from this file.
 *
 * Three consumers cannot read a token, and before 2026-09-11 all three carried the literal
 * `760` instead:
 *
 * | consumer | why the variable is unavailable |
 * |---|---|
 * | `src/views/docs-vault/lib/popout-template.ts` | a standalone window built from an inlined stylesheet string, outside the app's cascade |
 * | `src/widgets/docs-vault/ui/DocsVaultViewer.tsx` `sizes=` | Next's image sizing hint is parsed at build time, not by the browser's style engine |
 * | `src/widgets/doc-reading-pane/lib/outline-rail.ts` | pure arithmetic deciding whether the outline rail fits beside the column |
 *
 * ## The three stopped agreeing on what a pixel is (2026-09-12)
 *
 * The ramp is now written in `rem`, so `--measure-doc-column` follows the root font size and a
 * browser's text-only zoom moves the rendered column (709.1px at the 16px root, 1338.1px at a
 * 32px one — both measured). A number transcribed at one root is no longer the column; it is
 * the column *at 100%*. So each of the three answers the question separately:
 *
 * | consumer | verdict |
 * |---|---|
 * | popout window | **follows** — it is a document with its own root, so its stylesheet is written in `rem` and its own text zoom now reaches it |
 * | `sizes=` hint | **follows** — the hint is a CSS length list and accepts `rem`, resolved against the root, so one string covers every zoom level |
 * | outline-rail fit | **follows** — it reads the live root size through `docColumnPxAtRoot`, because a verdict about overlap must describe the column on screen |
 *
 * `DOC_COLUMN_PX` and `PROSE_MEASURE_PX` therefore remain as the values **at the default
 * root**: what the calibration gate compares the rendered token against, and the default
 * argument for the functions below.
 *
 * ⚠️ **This is a mirror, not a second source.** `PAGE_COLUMN_STAGE` in `page-frame.ts` is a
 * *className* that points at its token, which is the right shape when the consumer renders;
 * none of the three above do, so they need the number. The derivation is therefore written
 * once more, from the same three constants and in the same order, and the two are gated
 * against each other in `tests/e2e/prose-measure-calibration.spec.ts`: it reads the token off
 * a rendered page and fails if it has drifted from `DOC_COLUMN_PX`.
 */

/**
 * The measure itself — how many `ch` one line of authored prose may run.
 *
 * Mirrors `--measure-prose-steps`. Change it there and here together; the gate catches it
 * either way round.
 */
export const PROSE_MEASURE_STEPS = 66;

/**
 * Advance of the digit `0` in Pretendard Variable, in `em` — measured, not chosen
 * (`"0".repeat(100)` in the built export ÷ 100 = 9.531px at the 16px root). Mirrors
 * `--measure-zero-advance`, and the reason it has to exist at all is written beside that
 * token: `ch` is font-relative and a box cannot be.
 */
export const PROSE_ZERO_ADVANCE_EM = 0.5957;

/**
 * The size the document body is set in — `--text-reading`, the size the measure is spent at,
 * **at the default 16px root**.
 *
 * 14 until 2026-09-12, when the reading bodies moved to their own 16px step
 * (`docs/DECISIONS.md`, "The reading column is worth more of its pane than the measure was
 * buying"). The name keeps its spelling because the gate imports it.
 *
 * ⚠️ Since 2026-09-12 the token is `1rem`, not `16px`, so this number is a **root-size
 * assumption**, not a constant: under a browser text-only zoom the rendered token is
 * `rootFontSize × PROSE_MEASURE_REM`. Anything that needs the column *as it is on screen
 * right now* must call `docColumnPxAtRoot` with the live root size; the two consumers below
 * that keep this number say why they may.
 */
export const DOC_BODY_FONT_PX = 16;

/** The side inset a document column has always paired with (`px-6 md:px-10` at md and above). */
export const DOC_COLUMN_GUTTER_PX = 40;

/**
 * The measure as a multiple of the root font size — 66 × 0.5957 = **39.3162rem**.
 *
 * This is the root-relative form of the same quantity, and it is what a consumer that *can*
 * express a length in `rem` should use (the image `sizes` hint and the popout window's
 * stylesheet both do). Multiplying it by a root size gives the px.
 */
export const PROSE_MEASURE_REM = PROSE_MEASURE_STEPS * PROSE_ZERO_ADVANCE_EM;


/** The measure resolved at a given root size. At 16 it is 629.1px; at a 32px root, 1258.1px. */
export function proseMeasurePxAtRoot(rootFontPx: number): number {
  return PROSE_MEASURE_REM * rootFontPx;
}

/**
 * The document column box at a given root size — the measure spent at that root plus one
 * gutter each side. The gutters stay absolute for the same reason the chrome does: an inset is
 * a box, not a word. At 16 the box is 709.1px; at a 32px root it is 1338.1px (measured).
 */
export function docColumnPxAtRoot(rootFontPx: number): number {
  return proseMeasurePxAtRoot(rootFontPx) + 2 * DOC_COLUMN_GUTTER_PX;
}

/** The measure resolved at the body's size at the default root: 66 × 0.5957 × 16 = 629.1px. */
export const PROSE_MEASURE_PX = proseMeasurePxAtRoot(DOC_BODY_FONT_PX);

/** The document column box at the default root: the measure plus one gutter each side = 709.1px. */
export const DOC_COLUMN_PX = docColumnPxAtRoot(DOC_BODY_FONT_PX);
