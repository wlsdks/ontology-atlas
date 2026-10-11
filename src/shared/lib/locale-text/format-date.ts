/**
 * Short Korean-style date (YYYY.MM.DD) in the local timezone; invalid input
 * (null/undefined/unparseable) returns an empty string.
 *
 * 2026-07-21: this used `getUTC*`, so a real timestamp near midnight (a file
 * mtime, say) showed an edit that was "today" locally as "yesterday" — an edit at
 * 03:12 KST is 18:12 the previous day in UTC. A local-first tool that cannot keep
 * local midnight is a trust defect in itself, so everything uses the local
 * getters.
 */
export function formatDate(input: Date | string | null | undefined): string {
  if (input === null || input === undefined) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}
