/**
 * 검색어 매치 하이라이트용 — 텍스트를 매치/비매치 세그먼트로 분절한다.
 * 순수 데이터 변환(JSX 없음)이라 단위 테스트가 쉽고, 렌더 측은 세그먼트를
 * `<mark>` 등으로 그리기만 하면 된다.
 *
 * - 대소문자 무시, 모든 occurrence 매치.
 * - query 가 비었거나(trim 후) 매치가 없으면 전체를 단일 비매치 세그먼트로.
 * - 정규식 특수문자는 이스케이프해 리터럴처럼 안전하게 매칭한다.
 * - 멀티 토큰(공백 포함) 쿼리는 토큰 사이 공백을 "임의 개수의 공백류
 *   문자(스페이스/개행/탭)"로 유연하게 매치한다 — 문서 본문은 ~80자에서
 *   줄바꿈되므로(AGENTS.md 컨벤션), 사용자가 타이핑한 구절이 소스에서는
 *   줄바꿈을 사이에 두고 있을 수 있다. 리터럴 substring 매칭만 쓰면 이
 *   경우 0건이 나 하이라이트/스크롤이 무산된다(P1 검수 착지 결함).
 */
export interface HighlightSegment {
  text: string;
  match: boolean;
}

function escapeRegExpToken(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 쿼리를 공백-유연 정규식으로 컴파일한다. 토큰 사이 공백은 `\s+` 로 이어
 * 붙여 원문의 임의 공백류(스페이스/개행/탭 연속)와 매치한다. 각 토큰
 * 자체는 이스케이프된 리터럴이라 특수문자 안전성은 그대로 유지.
 * 쿼리가 비어 있으면 null.
 */
export function buildPhraseMatcher(
  query: string,
  flags = 'gi',
): RegExp | null {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const pattern = tokens.map(escapeRegExpToken).join('\\s+');
  return new RegExp(pattern, flags);
}

export function splitHighlightSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  const re = buildPhraseMatcher(query);
  if (!re) return [{ text, match: false }];

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let matchedAny = false;
  re.lastIndex = 0;
  while ((match = re.exec(text)) !== null) {
    matchedAny = true;
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), match: false });
    }
    segments.push({ text: match[0], match: true });
    cursor = match.index + match[0].length;
    // 이론상 토큰이 모두 non-empty 라 zero-length 매치는 없지만, 방어적으로
    // 무한루프를 막는다.
    if (match[0].length === 0) re.lastIndex += 1;
  }
  if (!matchedAny) return [{ text, match: false }];
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
}
