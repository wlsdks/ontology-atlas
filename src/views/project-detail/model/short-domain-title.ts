const MAX_LENGTH = 18;

/**
 * 미니 도메인 지도의 좁은 라벨 공간을 위한 도메인 제목 축약 — 순수 문자열
 * 변환이라 fabrication 없음(사용자가 vault frontmatter 에 적은 진짜 title
 * 의 앞부분). "Views (Topology · Browse · Builder)" 처럼 괄호로 부연 설명을
 * 덧붙인 제목에서 괄호 앞 핵심 이름만 남긴다. em-dash/가운데점은 (e.g.
 * "Vault — Local-First") 이 vault 에서 종종 실제 이름의 일부라 구분자로
 * 쓰지 않는다 — 괄호만 "qualifier" 로 취급.
 */
export function shortenDomainTitle(title: string): string {
  const parenIndex = title.indexOf(" (");
  const withoutQualifier = parenIndex > 0 ? title.slice(0, parenIndex).trim() : title;
  if (withoutQualifier.length <= MAX_LENGTH) return withoutQualifier;
  return `${withoutQualifier.slice(0, MAX_LENGTH - 1).trim()}…`;
}
