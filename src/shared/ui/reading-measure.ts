/**
 * **The reading measure as a number, for the places a CSS variable cannot reach.**
 *
 * `app/globals.css` owns the measure. `--measure-prose` is the cap on a *line* and stays in
 * `ch`; `--measure-doc-column` is the *box* and is that same measure spent at
 * `--text-body-lg` plus one `--measure-doc-gutter` each side. Every rendered surface reads
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
export const PROSE_MEASURE_STEPS = 60;

/**
 * Advance of the digit `0` in Pretendard Variable, in `em` — measured, not chosen
 * (`"0".repeat(100)` in the built export ÷ 100 = 9.531px at the 16px root). Mirrors
 * `--measure-zero-advance`, and the reason it has to exist at all is written beside that
 * token: `ch` is font-relative and a box cannot be.
 */
export const PROSE_ZERO_ADVANCE_EM = 0.5957;

/** The size the document body is set in — `--text-body-lg`, the font the measure is spent in. */
export const DOC_BODY_FONT_PX = 14;

/** The side inset a document column has always paired with (`px-6 md:px-10` at md and above). */
export const DOC_COLUMN_GUTTER_PX = 40;

/** The measure resolved at the body's size: 60 × 0.5957 × 14 = 500.4px. */
export const PROSE_MEASURE_PX =
  PROSE_MEASURE_STEPS * PROSE_ZERO_ADVANCE_EM * DOC_BODY_FONT_PX;

/** The document column box: the measure plus one gutter each side = 580.4px. */
export const DOC_COLUMN_PX = PROSE_MEASURE_PX + 2 * DOC_COLUMN_GUTTER_PX;
