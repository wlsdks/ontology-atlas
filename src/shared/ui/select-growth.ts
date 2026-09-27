/**
 * Pure growth arithmetic for the open listbox, matching `src/shared/lib/composer-growth.ts`:
 * the smaller of a row cap (summed heights of the first N rendered rows, so no row is
 * half-clipped) and a space cap (room left in the viewport) wins, and inner scroll and edge
 * affordances appear only when something is genuinely hidden.
 */

/**
 * A measured runner offers 7 models, which must fit unscrolled; eight rows (about 320px) stay
 * under half the 672px settings sheet, past which a dropdown reads as a panel.
 */
export const LISTBOX_MAX_ROWS = 8;

export interface ListboxGrowthMetrics {
  /** Rendered row heights in screen order; a row with a description is taller. */
  rowHeights: number[];
  paddingBlock: number;
  /** `box-sizing: border-box`, so the border counts toward height. */
  borderBlock: number;
  /** Vertical room left in the viewport from the anchor (px). */
  availableHeight: number;
}

export interface ListboxGrowth {
  /**
   * The `max-height` cap, not a height. Never the measured content height: a 1px late-font
   * growth would make the box scroll its own content. Unbound, it is the remaining space.
   */
  height: number;
  /** Rows that fit whole. */
  rows: number;
  /** The cap was reached and inner scroll exists. */
  overflowing: boolean;
  /** Which cap won, readable by a gate and a person. */
  cappedBy: 'content' | 'rows' | 'space';
}

/**
 * Returns `null` while inputs do not exist yet (SSR, first frame, no options); the caller then
 * caps with the remaining space alone rather than collapsing to 0px.
 */
export function listboxGrowth(metrics: ListboxGrowthMetrics): ListboxGrowth | null {
  const { rowHeights, paddingBlock, borderBlock, availableHeight } = metrics;
  if (!Array.isArray(rowHeights) || rowHeights.length === 0) return null;
  if (!rowHeights.every((h) => Number.isFinite(h) && h > 0)) return null;
  if (!Number.isFinite(paddingBlock) || !Number.isFinite(borderBlock)) return null;
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) return null;

  const chrome = paddingBlock + borderBlock;
  const contentHeight = rowHeights.reduce((sum, h) => sum + h, 0) + chrome;
  // At or below the row cap nothing binds (see `height`).
  const rowCap =
    rowHeights.length > LISTBOX_MAX_ROWS
      ? rowHeights.slice(0, LISTBOX_MAX_ROWS).reduce((sum, h) => sum + h, 0) + chrome
      : Number.POSITIVE_INFINITY;

  const height = Math.min(rowCap, availableHeight);
  // 1px of slack, so sub-pixel rounding never claims an overflow.
  const overflowing = contentHeight > height + 1;
  const cappedBy = !overflowing ? 'content' : availableHeight < rowCap ? 'space' : 'rows';

  let used = chrome;
  let rows = 0;
  for (const rowHeight of rowHeights) {
    if (used + rowHeight > height + 1) break;
    used += rowHeight;
    rows += 1;
  }

  return { height, rows, overflowing, cappedBy };
}

/** On only once the cap is reached and something above is hidden, as `composerTopIsHidden`. */
export function listboxTopIsHidden(overflowing: boolean, scrollTop: number): boolean {
  return overflowing && Number.isFinite(scrollTop) && scrollTop > 0;
}

/** Usually the edge carrying "there is more": on open the list sits at the top. */
export function listboxBottomIsHidden(
  overflowing: boolean,
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): boolean {
  if (!overflowing) return false;
  if (![scrollTop, clientHeight, scrollHeight].every(Number.isFinite)) return false;
  return scrollTop + clientHeight + 1 < scrollHeight;
}

/**
 * Keeps the trigger's left edge while the list fits, otherwise slides left to the viewport
 * padding and never past the left padding: on screen before under the trigger.
 */
export function listboxLeft(metrics: {
  triggerLeft: number;
  listWidth: number;
  viewportWidth: number;
  pad: number;
}): number {
  const { triggerLeft, listWidth, viewportWidth, pad } = metrics;
  const rightmost = viewportWidth - pad - listWidth;
  return Math.max(pad, Math.min(triggerLeft, rightmost));
}
