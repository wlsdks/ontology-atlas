/**
 * 한국식 짧은 날짜 표기 (YYYY.MM.DD).
 * 유효하지 않은 입력(null/undefined/invalid)은 빈 문자열 반환.
 */
export function formatDate(input: Date | string | null | undefined): string {
  if (input === null || input === undefined) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}
