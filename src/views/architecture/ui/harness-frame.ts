/**
 * The Harness shell cannot box its content in `PAGE_FRAME`'s 1600px column (its header rule, tab
 * rail and blueprint docks meet the pane edges), so the cap is paid as a gutter that puts the
 * start line where `PAGE_FRAME` would. `cqw` resolves against `HARNESS_FRAME_CONTAINER`.
 */
export const HARNESS_FRAME_CONTAINER = '@container/harness' as const;

/** Horizontal gutter at `md` and up. Below `md` the frame's 20px inset applies unchanged. */
export const HARNESS_GUTTER_X =
  'px-5 md:px-[max(2.5rem,calc((100cqw_-_var(--page-max))/2_+_2.5rem))]' as const;

/** The start-line half alone, for a box whose right edge meets a dock rather than the pane. */
export const HARNESS_GUTTER_LEFT =
  'pl-5 md:pl-[max(2.5rem,calc((100cqw_-_var(--page-max))/2_+_2.5rem))]' as const;
