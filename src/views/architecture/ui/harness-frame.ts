/**
 * **The Harness destination's frame: the page cap, paid as a gutter.**
 *
 * Every framed destination stands in `PAGE_FRAME`'s 1600px column (`--page-max`, 40px inset). The
 * Harness shell cannot wear that column as a box: its header row draws a rule that spans the pane,
 * its tab strip's rail must land on that rule, and the blueprint view's canvas and docks meet the
 * pane's edges. Wrapping any of them in `mx-auto max-w-…` cut the rule short or moved the docks
 * off the edge, and dropping the cap instead let the four views stretch without limit — at 1920
 * the coverage cards were 575px wide around 150px of content (design review, 2026-09-25).
 *
 * So the cap is converted into padding. Below the cap the gutter is the frame's own 40px; above it
 * the gutter grows by half the surplus, which puts the text start line exactly where
 * `PAGE_FRAME`'s content starts on every other destination — and the header, the data views and
 * the blueprint toolbar all read the same number, because `cqw` resolves against one container
 * (`HARNESS_FRAME_CONTAINER`, on the shell's root) rather than against each padded box.
 */
export const HARNESS_FRAME_CONTAINER = '@container/harness' as const;

/** Horizontal gutter at `md` and up. Below `md` the frame's 20px inset applies unchanged. */
export const HARNESS_GUTTER_X =
  'px-5 md:px-[max(2.5rem,calc((100cqw_-_var(--page-max))/2_+_2.5rem))]' as const;

/** The start-line half alone, for a box whose right edge meets a dock rather than the pane. */
export const HARNESS_GUTTER_LEFT =
  'pl-5 md:pl-[max(2.5rem,calc((100cqw_-_var(--page-max))/2_+_2.5rem))]' as const;
