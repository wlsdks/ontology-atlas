/**
 * **One list rhythm for every insights card.**
 *
 * Measured on the fixture vault at 1512x949 (2026-09-25), five cards drew five list grammars:
 * domain-capacity rows ~79px apart for 8px bars, cross-share rows ~86px, relation-type rows
 * 57-64px, growth domain rows ~103px, and the do-next list at 44px. Every one of the spread lists
 * came from `justify-evenly` stretching a few rows over a card made tall by its neighbour, so
 * "list" meant a different distance on each card and the eye read the gaps as meaning.
 *
 * Rows now stack from the top with a divider between them, at the touch-row floor (44px) with
 * the ramp's `py-3` inset; content is top-aligned by the list, and a card's remaining height
 * belongs to its caption line (`mt-auto`) rather than being shared out between rows.
 */
export const INSIGHTS_LIST = "flex flex-col divide-y divide-[color:var(--color-divider)]";

/** One row of `INSIGHTS_LIST`. Callers add their own horizontal layout. */
export const INSIGHTS_LIST_ROW = "min-h-11 py-3";
