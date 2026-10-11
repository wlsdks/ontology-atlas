/**
 * Short date (YYYY.MM.DD) in the local timezone; invalid input returns an empty string. Local
 * getters, not `getUTC*`: an edit just after local midnight must not show as yesterday.
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
