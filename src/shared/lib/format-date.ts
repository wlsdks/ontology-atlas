/**
 * 한국식 짧은 날짜 표기 (YYYY.MM.DD) — 로컬 타임존 기준.
 * 유효하지 않은 입력(null/undefined/invalid)은 빈 문자열 반환.
 *
 * P4-③ (2026-07-21 리텐션 라운드): 이전엔 `getUTC*` 를 써서 실제 시각(예:
 * 파일 mtime)이 자정 부근에 걸치면 로컬에서 "오늘"인 갱신이 "어제"로
 * 표시됐다(예: 03:12 KST 갱신이 UTC 로는 전날 18:12). 로컬-퍼스트 도구가
 * 로컬 자정을 못 지키는 건 그 자체로 신뢰 결손이라 로컬 getter 로 통일한다.
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
