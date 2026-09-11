/**
 * **Show the part of the line the person actually searched for.**
 *
 * The index column's search caption prints one unit of a document, clipped to one line by
 * `truncate`. Measured across fourteen widths on 2026-09-11 (design-responsive, U2
 * council): the caption fits about **33 characters from the start of the unit** at the
 * column's own width, so a phrase further in than that is invisible while its row claims a
 * match. The fixture's own `fee-schedule.csv` record is the case: `T+2` sits past the
 * method and region columns.
 *
 * So the window moves to the phrase instead of the phrase having to be near the start.
 * The string stays the file's own text — nothing is rewritten, only left out, and the
 * leading ellipsis says so. The full unit is still the caption's `title` and the pane
 * below it.
 *
 * Two rules hold the cut honest:
 *
 * - **A few words of run-up.** Landing exactly on the match reads as a fragment; the cut
 *   is `LEAD_CHARS` earlier, so the phrase arrives with the words that introduce it.
 * - **Never mid-word.** The cut walks back to the nearest space inside `WORD_SNAP_CHARS`.
 *   A window opening on `…hedule` is the broken-word defect this repository already
 *   rejects for wrapping, and it costs nothing to avoid.
 */

/** What one caption line shows, measured at the index column's width. */
const CAPTION_VISIBLE_CHARS = 33;

/** Words of run-up kept before the matched phrase. */
const LEAD_CHARS = 8;

/** How far back the cut may walk to land on a word boundary rather than inside a word. */
const WORD_SNAP_CHARS = 12;

/** The leading mark that says text was left out. Typography, not a sentence. */
const ELLIPSIS = "…";

export function captionWindow(text: string, needle: string): string {
  if (!needle) return text;
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  // Not found (a path match), or already inside the budget: the line stands as it is.
  if (at < 0 || at <= CAPTION_VISIBLE_CHARS) return text;
  let cut = at - LEAD_CHARS;
  const boundary = text.lastIndexOf(" ", cut);
  if (boundary >= 0 && cut - boundary <= WORD_SNAP_CHARS) cut = boundary + 1;
  return `${ELLIPSIS}${text.slice(cut)}`;
}
