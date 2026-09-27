/**
 * One list rhythm for every insights card: rows stack from the top with a divider, at the 44px touch-row floor
 * with the ramp's `py-3` inset, and a card's spare height goes to its caption (`mt-auto`), never shared out between
 * rows. The divider belongs to a plain cell, never a hover row: a pressable row bleeds `-mx-1.5 px-1.5`, so a
 * divider on it would pass the padding line and curve with the row radius.
 */
export const INSIGHTS_LIST = "flex flex-col divide-y divide-[color:var(--color-divider)]";

/** One row of `INSIGHTS_LIST`; callers add their own horizontal layout. */
export const INSIGHTS_LIST_ROW = "min-h-11 py-3";

/** The same list in two columns on a wide board (hubs, impact ranking); ranks read left to right, then down. */
export const INSIGHTS_LIST_TWO_COLUMN = "grid auto-rows-min content-start gap-x-6 @min-[960px]/insights:grid-cols-2";

/**
 * The cell around one two-column row. Not `divide-y`: the second column's first row is a column head, and a line
 * above it reads as a torn table.
 */
export function insightsTwoColumnCell(index: number, count?: number): string {
  // With the count passed, an odd list's last row spans both columns instead of standing beside an empty cell.
  const span = count !== undefined && count % 2 === 1 && index === count - 1 ? " @min-[960px]/insights:col-span-2" : "";
  if (index === 0) return span.trim();
  if (index === 1) return "border-t border-[color:var(--color-divider)] @min-[960px]/insights:border-t-0";
  return `border-t border-[color:var(--color-divider)]${span}`;
}

/**
 * The brief's two columns. The gutter is two card insets (`gap-x-8`), so the second column starts where the band's
 * third tile does.
 */
export const BRIEF_TWO_COLUMN = "grid auto-rows-min content-start gap-x-8 @min-[960px]/insights:grid-cols-2";
