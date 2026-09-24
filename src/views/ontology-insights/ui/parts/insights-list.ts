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
 *
 * ⚠️ **The divider belongs to a plain cell, never to a hover row.** A pressable row takes
 * `-mx-1.5 px-1.5` so only its hover surface passes the card inset. With the divider on that
 * row, every line ran 6px past the padding line on both sides and curved with the row radius,
 * while the caption's divider in the same card sat on the padding line (review, 2026-09-25).
 * A row that bleeds sits inside a cell of the list; the cell carries the line.
 */
export const INSIGHTS_LIST = "flex flex-col divide-y divide-[color:var(--color-divider)]";

/** One row of `INSIGHTS_LIST`. Callers add their own horizontal layout. */
export const INSIGHTS_LIST_ROW = "min-h-11 py-3";

/**
 * The same list folded into two columns once the board is wide enough (full-width cards: hubs,
 * impact ranking). Ranks read left to right, then down.
 */
export const INSIGHTS_LIST_TWO_COLUMN = "grid auto-rows-min content-start gap-x-6 @min-[960px]/insights:grid-cols-2";

/**
 * The cell around one row of `INSIGHTS_LIST_TWO_COLUMN`. `divide-y` cannot serve a grid: the
 * second column's first row is also a column head, and a line above it reads as a torn table.
 */
export function insightsTwoColumnCell(index: number): string {
  if (index === 0) return "";
  if (index === 1) return "border-t border-[color:var(--color-divider)] @min-[960px]/insights:border-t-0";
  return "border-t border-[color:var(--color-divider)]";
}
