/**
 * Progress copy that does not pretend to know what it does not.
 *
 * **Why it lives in `shared`.** Two features on the same layer need this
 * judgement — app-update downloads and agent-tool installation — and two
 * same-layer features needing one decision means it moves a layer down
 * (`.claude/rules/architecture.md`). With a copy each, one of them eventually
 * starts drawing 0% when the total is unknown.
 */

/**
 * `null` when the total is unknown — no invented percentage. A non-positive
 * denominator counts as unknown for the same reason: putting a division by zero
 * on screen draws the arithmetic accident, not the progress.
 */
export function formatDownloadProgress(received: number, total: number | null): string | null {
  if (total === null || total <= 0) return null;
  const percent = Math.min(100, Math.max(0, Math.round((received / total) * 100)));
  return `${percent}%`;
}
