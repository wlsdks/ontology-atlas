/**
 * URL 친화적 slug 생성. 한글 보존, 공백은 하이픈으로, 특수문자 제거.
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '') // 문자·숫자·공백·하이픈만 유지
    .replace(/\s+/g, '-')              // 공백 → 하이픈
    .replace(/-+/g, '-');              // 중복 하이픈 정리
}
