/**
 * 읽는 시간 추정 — ≈200 단어/분 기준. 한글은 글자당 평균이 다르지만
 * 영·한 혼합 대략 감만 표시. 1분 미만은 "1분" 으로 floor.
 */
export function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 200));
}
