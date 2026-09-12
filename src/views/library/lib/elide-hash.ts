/**
 * **A sha256 on one line, with both of its ends** (2026-09-12).
 *
 * The source pane's `sha256` row printed all 64 characters plus the clause saying when
 * the value was measured, and at the app's own window floor that is more than the column
 * holds: measured on the static export at 1040x720, the value cell is 456px wide and the
 * row ran to **two 16px lines** (84 characters against a ~69-character line), so the one
 * fixed-height fact list in this pane changed height depending on whether anything had
 * ever cited the file. It wrapped at 1512 as well.
 *
 * The middle is what goes, not the tail. A hash is read here to **compare** — against the
 * value a wiki page recorded, or against `shasum` in a terminal — and a comparison uses
 * both ends; an end-truncated hash can only be compared from the front, which is the half
 * that collides. The whole value stays one hover away (`title` on the cell) and is never
 * re-derived for display, so what a reader copies is the measurement, not this string.
 *
 * The kept length is per end, not total, so the two ends are always equal — a lopsided
 * elision reads as a string that was cut rather than one that was shortened.
 */

/** How many characters of each end survive. 16 keeps 32 of 64 and fits 1040 on one line. */
export const HASH_ELISION_KEPT_PER_END = 16;

/**
 * `value` with its middle replaced by a single ellipsis, or `value` unchanged when
 * eliding it would not make it shorter.
 *
 * Anything that is not a long hash — an empty string, a short digest, a sentence standing
 * in for a hash that was never measured — comes back as it went in, so the caller may pass
 * whatever the row holds without asking first.
 */
export function elideHashMiddle(value: string, keptPerEnd: number = HASH_ELISION_KEPT_PER_END): string {
  if (keptPerEnd <= 0) return value;
  if (value.length <= keptPerEnd * 2 + 1) return value;
  return `${value.slice(0, keptPerEnd)}…${value.slice(-keptPerEnd)}`;
}
