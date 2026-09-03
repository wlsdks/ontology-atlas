/**
 * **Growth and caps for the open listbox** — one set of pure arithmetic.
 *
 * Sibling of `src/shared/lib/composer-growth.ts`, and the grammar is matched on
 * purpose: the cap is a rule rather than a literal, inner scroll appears **only**
 * once the cap is reached, and edge affordances turn on **only** when something is
 * genuinely hidden. Two surfaces solving the same problem differently leaves the
 * next person unsure which one to copy.
 *
 * **Why the cap has to be a rule.** The old cap was a single `max-h-[264px]`
 * literal, and that value **answered nothing**: how many options stay fully
 * visible, when scrolling starts, what happens when it opens near the bottom of the
 * screen. All three turned out wrong — an ancestor clipped it to 39px of 264px
 * (14.8% visible) and only 1 of 7 options was clickable.
 *
 * There are **two** caps and the smaller wins:
 *
 * 1. **Row cap** (`LISTBOX_MAX_ROWS`) — where growth stops. Row heights vary (some
 *    rows carry a description line), so this is not row count × fixed height but
 *    **the summed heights of the first N rendered rows**. Same reason the composer
 *    removed every place a value could be cut at a fractional line: never produce a
 *    half-clipped row.
 * 2. **Space cap** (`availableHeight`) — the room actually left in the viewport from
 *    the anchor. Applying the row cap verbatim to a trigger near the bottom of the
 *    screen pushes the list out of the window.
 *
 * **Why pure functions.** The caller does the DOM measuring (row rects, padding,
 * remaining space) and the decision happens here, so invariants like "7 options are
 * fully visible without scrolling" can be pinned by unit tests without jsdom. This
 * is reachability, not motion, so the rule must hold under reduced-motion too.
 */

/**
 * The growth cap, in rows. Past this the box stops growing and scrolls internally.
 *
 * Two independent measurements put it at 8:
 *
 * 1. **The common case must not scroll.** The runner measured (Ollama) offered
 *    **7** models. A scrollbar over a fully visible list makes "there is more" a
 *    lie and sends the user hunting for options that do not exist. 8 leaves one
 *    row of headroom above 7.
 * 2. **A dropdown must not become a panel.** Eight rows with description lines mixed
 *    in is ≈320px, and the settings sheet this list opens inside is 672px. Growing
 *    past half of it reads as a covering surface rather than a control you pick
 *    from — and the answer at that point is search, not a bigger dropdown.
 *
 * From the 9th option on, scrolling is **real information**, and only then does the
 * affordance turn on.
 */
export const LISTBOX_MAX_ROWS = 8;

export interface ListboxGrowthMetrics {
  /**
   * Actual rendered heights (px) of the option rows, in screen order.
   *
   * Not row count × fixed height: a row carrying a description such as
   * "embedding only" wraps to two lines and is taller. A fixed height leaves a half
   * row hanging near the cap.
   */
  rowHeights: number[];
  /** The list box's padding-top + padding-bottom. */
  paddingBlock: number;
  /** border-top + border-bottom (`box-sizing: border-box`, so it counts toward height). */
  borderBlock: number;
  /** Vertical room actually left in the viewport from the anchor (px). */
  availableHeight: number;
}

export interface ListboxGrowth {
  /**
   * The value to write into `max-height` (px) — **a cap, not a height.**
   *
   * Below the cap the box grows to its own content. Never write the *measured
   * content height* here: the moment sub-pixel rounding or a **late-arriving web
   * font** grows a row by 1px, the box starts scrolling its own content (measured
   * in the installed app — all 7 options visible yet `scrollHeight >
   * clientHeight`, which switched the "there is more" affordance on falsely). When
   * nothing binds, the cap is **the remaining space**.
   */
  height: number;
  /** How many rows fit whole, without clipping. */
  rows: number;
  /** Whether the cap was reached and **inner scroll actually exists**. */
  overflowing: boolean;
  /** Which cap won — so a gate and a human can read the cause by name. */
  cappedBy: 'content' | 'rows' | 'space';
}

/**
 * Measurements → height. Returns `null` while the inputs do not exist yet (SSR,
 * first frame, zero options), and the caller then caps with the remaining space
 * alone — leaving it alone always beats collapsing to 0px.
 */
export function listboxGrowth(metrics: ListboxGrowthMetrics): ListboxGrowth | null {
  const { rowHeights, paddingBlock, borderBlock, availableHeight } = metrics;
  if (!Array.isArray(rowHeights) || rowHeights.length === 0) return null;
  if (!rowHeights.every((h) => Number.isFinite(h) && h > 0)) return null;
  if (!Number.isFinite(paddingBlock) || !Number.isFinite(borderBlock)) return null;
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) return null;

  const chrome = paddingBlock + borderBlock;
  const contentHeight = rowHeights.reduce((sum, h) => sum + h, 0) + chrome;
  // At or below the cap the row cap **binds nothing**. Using the content height as
  // the cap there would make the box scroll its own content (see `height` above).
  const rowCap =
    rowHeights.length > LISTBOX_MAX_ROWS
      ? rowHeights.slice(0, LISTBOX_MAX_ROWS).reduce((sum, h) => sum + h, 0) + chrome
      : Number.POSITIVE_INFINITY;

  const height = Math.min(rowCap, availableHeight);
  // 1px of slack, so sub-pixel rounding never claims an overflow.
  const overflowing = contentHeight > height + 1;
  const cappedBy = !overflowing ? 'content' : availableHeight < rowCap ? 'space' : 'rows';

  // Count only rows that fit **whole** — a half row is not a row that fits.
  let used = chrome;
  let rows = 0;
  for (const rowHeight of rowHeights) {
    if (used + rowHeight > height + 1) break;
    used += rowHeight;
    rows += 1;
  }

  return { height, rows, overflowing, cappedBy };
}

/**
 * When the top affordance turns on — **only once the cap is reached and something
 * above is genuinely hidden.** While the list is still growing nothing is covered,
 * so there is no signal. Same decision as `composerTopIsHidden`.
 */
export function listboxTopIsHidden(overflowing: boolean, scrollTop: number): boolean {
  return overflowing && Number.isFinite(scrollTop) && scrollTop > 0;
}

/**
 * When the bottom affordance turns on. This is the edge that usually carries
 * "there is more": on open the list sits at the top, so only the bottom is covered.
 */
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
 * Where the list's left edge goes — **the list stays on screen before it stays
 * under the trigger.**
 *
 * The list is anchored to the trigger's left edge and grows to its content, so a
 * trigger sitting at the right of its panel opened a wide list straight through
 * the window's edge: measured on the installed app's chat composer (owner
 * screenshot, 2026-09-03), the work-mode list lost its description column past
 * the right border. Mirrors the vertical flip: keep the trigger's edge while it
 * fits, otherwise slide left until the list's right edge sits at the viewport
 * padding, and never past the left padding.
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

