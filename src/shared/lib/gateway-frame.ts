/**
 * The **two frame pieces** every gateway surface shares — the origin padding and
 * the single column inside it.
 *
 * Moved out of `views/download` on 2026-07-30. While the gateway was one view a
 * local constant sufficed, but once `/guide` and `/changelog` took the same
 * chrome it became **views importing each other**. The FSD rule (avoid
 * same-layer cross-imports; pull shared things down one layer) puts it in
 * `shared`, where the gateway chrome widget and the gateway views all read one
 * copy.
 *
 * The rationale for the values is unchanged. The 2026-07-29 verdict ③
 * 「One grid for everything」 (one grid for everything) protects *every element standing
 * on the same x*, and the single source of that x is `--gateway-origin`
 * (`app/globals.css`, `views/download/lib/gateway-grid.ts`).
 */

/**
 * The origin padding. **Because it is `px-`, both sides** take the origin, and
 * that is the whole of the left/right symmetry.
 *
 * Below `md` this token does not govern — `max(1.5rem, safe-area)` does, because
 * a 200px gutter starves the content at narrow widths.
 */
export const PAGE_GUTTER =
  'px-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] md:px-[var(--gateway-origin)]';

/**
 * The one column inside the origin — pinned left, stopping at
 * `--gateway-page-max`.
 *
 * On wide screens this cap is **the other half of the symmetry**: with each side
 * padded by (vw−1920)/2 the remaining width is exactly 1920, so the column fills
 * it and the right margin matches automatically. That is why no `mx-auto` is
 * needed.
 *
 * Revised 2026-08-19: the cap moved from `--page-max` (1600) to
 * `--gateway-page-max` (1920). Chosen from the owner's measurement at 2560 (480
 * of margin on each side) as "widen the gateway only" — every other screen keeps
 * `--page-max`. The origin formula (`--gateway-origin`) reads the same cap, so
 * the symmetry still holds. Rationale for the value and the no-regression
 * invariant at ≤1920 live in the `--gateway-page-max` doc-block in
 * `app/globals.css`. Gate:
 * `tests/contract/gateway-column-width.contract.test.ts`.
 */
export const PAGE_COLUMN = 'w-full max-w-[var(--gateway-page-max)]';
