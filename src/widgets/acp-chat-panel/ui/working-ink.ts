/**
 * **Work that is still arriving reads as alive; work that has landed reads as still.**
 *
 * Owner report, 2026-09-24: while the agent worked, a running tool row, the work group and
 * the composer's 「thinking · 25s」 looked exactly like a finished transcript — static grey
 * text — so there was no way to tell at a glance whether anything was happening. The
 * answer is one mark with one meaning: a light band sweeping across the words of whatever
 * is in flight (`.acp-working-shimmer` in `app/globals.css`), and nothing on anything that
 * has finished.
 *
 * The decision of *which* state carries it lives here, as plain functions, so the mapping
 * is tested without rendering the panel and every caller asks the same question.
 */
export const WORKING_SHIMMER_CLASS = 'acp-working-shimmer';

/** The shimmer class for text whose work is still in flight, or nothing once it has landed. */
export function workingShimmer(live: boolean): string | undefined {
  return live ? WORKING_SHIMMER_CLASS : undefined;
}

/**
 * Whether the composer's status words are the agent working.
 *
 * Only `thinking` is. `awaiting` is the agent blocked on the person's answer — the work is
 * waiting on *them*, and a sweeping band there would say the opposite. A turn that has gone
 * silent has its own sentence; animating over it would claim output that is not arriving.
 */
export function composerStatusLive(footerStatus: string, silent: boolean): boolean {
  return footerStatus === 'thinking' && !silent;
}
