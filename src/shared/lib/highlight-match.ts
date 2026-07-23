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
 * - 구절 전체가 어디에도 연속으로 없으면(스캐터드 AND 매치) 개별 토큰
 *   OR 매치로 폴백한다 — `widgets/docs-vault/lib/search.ts` 의 `searchDocs`
 *   는 멀티 토큰 쿼리를 "각 토큰이 문서 어딘가에 있으면 히트"로 인정하고
 *   구절이 안 이어지면 `bodyTierScore`(최하위 티어)로만 채점할 뿐, 구절
 *   존재를 요구하지 않는다. 하이라이트가 구절 전체 매치만 인정하면
 *   "검색은 히트라는데 뷰어엔 mark 가 0개"인 착지 결함이 난다(최종 라이브
 *   스윕 P2 — "관계 타입" 검색 → CLI Developer Entry 본문 매치 클릭 재현).
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
 *
 * 랭킹(`search.ts` bodyPhraseScore/bodyTierScore 분기)이 이 함수로 "구절이
 * 실제로 이어지는지"를 판정하므로, 동작을 바꾸면 랭킹 계약도 함께 바뀐다 —
 * 스캐터드-토큰 폴백은 여기가 아니라 `splitHighlightSegments` 전용으로 둔다.
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

/**
 * 멀티 토큰 쿼리의 스캐터드 AND 매치(구절이 어디에도 연속으로 없음) 전용
 * 폴백 matcher — 각 토큰을 리터럴 alternation 으로 묶어 OR 매치한다. 짧은
 * 토큰이 긴 토큰의 부분 문자열일 때 짧은 쪽이 먼저 먹어 긴 쪽을 가리지
 * 않도록 길이 내림차순으로 정렬한다. 단일 토큰(길이 1)이거나 토큰이 없으면
 * null — 그 경우는 `buildPhraseMatcher` 결과와 동일해 폴백 의미가 없다.
 */
function buildScatteredTokenMatcher(
  tokens: string[],
  flags = 'gi',
): RegExp | null {
  if (tokens.length < 2) return null;
  const escaped = [...tokens].sort((a, b) => b.length - a.length).map(escapeRegExpToken);
  return new RegExp(escaped.join('|'), flags);
}

/** 주어진 정규식으로 text 를 매치/비매치 세그먼트로 분절. 매치가 하나도
 *  없으면 null(폴백 판단은 호출부 책임). */
function scanSegments(text: string, re: RegExp): HighlightSegment[] | null {
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
  if (!matchedAny) return null;
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
}

export function splitHighlightSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  const re = buildPhraseMatcher(query);
  if (!re) return [{ text, match: false }];

  const phraseSegments = scanSegments(text, re);
  if (phraseSegments) return phraseSegments;

  // 구절 전체 매치가 없으면 스캐터드 토큰 폴백 — search.ts 의 AND 매치
  // 계약과 하이라이트를 일치시켜 착지(mark + scrollIntoView)를 보장한다.
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const tokenRe = buildScatteredTokenMatcher(tokens);
  if (!tokenRe) return [{ text, match: false }];
  return scanSegments(text, tokenRe) ?? [{ text, match: false }];
}
