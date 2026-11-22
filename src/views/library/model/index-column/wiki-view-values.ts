export interface WikiViewValueInput {
  lastCompileAt: string | undefined;
  lastCheckAt: string | undefined;
  /** Findings the open Check results hold; a positive count is shown instead of a date. */
  reportCount: number;
  formatDay: (ms: number) => string | null;
  formatCount: (count: number) => string;
  checkNever: string;
  logNone: string;
}

/**
 * The values beside the wiki list's Log and Check results rows: the Check row shows its findings
 * while it has any and else when the last check ran; the Log row shows the later of the last
 * compile and the last check.
 */
export function wikiViewValues(input: WikiViewValueInput): { checkValue: string; logValue: string } {
  const lastCheckMs = Date.parse(input.lastCheckAt ?? "");
  const lastLogMs = Math.max(
    Date.parse(input.lastCompileAt ?? "") || Number.NEGATIVE_INFINITY,
    Date.parse(input.lastCheckAt ?? "") || Number.NEGATIVE_INFINITY,
  );
  const checkValue = input.reportCount > 0
    ? input.formatCount(input.reportCount)
    : Number.isFinite(lastCheckMs)
      ? input.formatDay(lastCheckMs) ?? ""
      : input.checkNever;
  const logValue = Number.isFinite(lastLogMs) ? input.formatDay(lastLogMs) ?? "" : input.logNone;
  return { checkValue, logValue };
}
