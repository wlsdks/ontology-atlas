/**
 * Progress copy that does not pretend to know what it does not. It lives in `shared` because
 * app-update downloads and agent-tool installation both need the judgement
 * (`.claude/rules/architecture.md`); a copy each would eventually draw 0% for an unknown total.
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
