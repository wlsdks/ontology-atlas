/**
 * Composer height in whole lines (`rows * lineHeight + padding + border`) so no row of glyphs is
 * clipped at the top edge. Pure functions: the caller measures the DOM, so invariants are testable
 * without jsdom.
 */

/** The minimum size offered to someone who has not typed anything yet. */
export const COMPOSER_MIN_ROWS = 2;
/**
 * Default growth cap. Past this the input starts pushing the conversation out of
 * view, so further content scrolls inside instead of growing the box.
 *
 * The number was chosen for **a narrow strip inside one screen** (the bottom bar
 * of the key-entry panel). It is too stingy for a tall column — those places
 * derive their cap **from their own height** via `composerMaxRows` below.
 */
export const COMPOSER_MAX_ROWS = 6;

/**
 * The share of available space the composer may take; a ratio, since a fixed row count fails when
 * the window shrinks.
 */
const COMPOSER_MAX_SHARE = 0.4;

/** Absolute growth ceiling. Larger than this is an editor, not an input. */
export const COMPOSER_CEILING_ROWS = 16;

/**
 * Max rows allowed at this site, derived from the height available.
 *
 * When it cannot be measured (SSR, just before mount) it falls back to the
 * default cap. There is no path to zero rows: the floor is one row above the
 * starting size, because a growing input that cannot grow is no better than none.
 */
export function composerMaxRows(availableHeight: number, lineHeight: number): number {
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) return COMPOSER_MAX_ROWS;
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return COMPOSER_MAX_ROWS;
  const rows = Math.floor((availableHeight * COMPOSER_MAX_SHARE) / lineHeight);
  return Math.min(Math.max(rows, COMPOSER_MIN_ROWS + 1), COMPOSER_CEILING_ROWS);
}

export interface ComposerMetrics {
  /** Computed line height (px). */
  lineHeight: number;
  /** padding-top + padding-bottom. */
  paddingBlock: number;
  /** border-top + border-bottom (included in the height under `box-sizing: border-box`). */
  borderBlock: number;
  /**
   * The offscreen mirror's `scrollHeight` — padding included, border excluded.
   *
   * **Why not measure the visible input**: the `style.height=''` → reflow →
   * reassign pattern resets the height to 0 and back every frame, which turns
   * growth into a staircase instead of a smooth transition.
   */
  contentHeight: number;
}

export interface ComposerGrowth {
  /** Height (px) to write straight onto the input. Always whole lines plus chrome. */
  height: number;
  /** Rows the box holds (MIN..MAX). */
  rows: number;
  /** Whether the cap was reached and inner scrolling **actually appeared**. */
  overflowing: boolean;
}

/**
 * Measurements → height. Returns `null` while the inputs are missing (SSR, jsdom,
 * before fonts load) and the caller then does nothing — leaving the box alone is
 * always better than collapsing it to 0px.
 */
export function composerGrowth(
  metrics: ComposerMetrics,
  /** Cap for this site. Tall columns derive it from their own height via `composerMaxRows`. */
  maxRows: number = COMPOSER_MAX_ROWS,
): ComposerGrowth | null {
  const { lineHeight, paddingBlock, borderBlock, contentHeight } = metrics;
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return null;
  if (!Number.isFinite(paddingBlock) || !Number.isFinite(borderBlock)) return null;
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return null;

  // A cap below the starting size would make the growing input shrink instead.
  const cap = Math.max(COMPOSER_MIN_ROWS, Math.floor(maxRows));
  const textHeight = contentHeight - paddingBlock;
  const wanted = Math.max(1, Math.round(textHeight / lineHeight));
  const rows = Math.min(Math.max(wanted, COMPOSER_MIN_ROWS), cap);
  return {
    height: rows * lineHeight + paddingBlock + borderBlock,
    rows,
    overflowing: wanted > cap,
  };
}

/**
 * Snap the scroll position to the line grid. After the box shrinks (text deleted)
 * or grows, the `scrollTop` the browser leaves behind is unrelated to the grid;
 * left alone it puts half a line across the top edge on the next frame.
 */
export function snapScrollTop(scrollTop: number, lineHeight: number): number {
  if (!Number.isFinite(scrollTop) || !Number.isFinite(lineHeight) || lineHeight <= 0) {
    return scrollTop;
  }
  return Math.round(scrollTop / lineHeight) * lineHeight;
}

/**
 * When to turn on the top fade — **only once the cap is reached and something is
 * actually hidden above.** While the box is still growing nothing is covered, so
 * there is no signal: overflow that does not exist is not advertised.
 */
export function composerTopIsHidden(overflowing: boolean, scrollTop: number): boolean {
  return overflowing && Number.isFinite(scrollTop) && scrollTop > 0;
}
