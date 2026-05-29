/**
 * 검색어 매치 하이라이트용 — 텍스트를 매치/비매치 세그먼트로 분절한다.
 * 순수 데이터 변환(JSX 없음)이라 단위 테스트가 쉽고, 렌더 측은 세그먼트를
 * `<mark>` 등으로 그리기만 하면 된다.
 *
 * - 대소문자 무시, 모든 occurrence 매치.
 * - query 가 비었거나(trim 후) 매치가 없으면 전체를 단일 비매치 세그먼트로.
 * - 리터럴 substring 매칭(정규식 아님) — 사용자 입력의 특수문자 안전.
 */
export interface HighlightSegment {
  text: string;
  match: boolean;
}

export function splitHighlightSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, match: false }];

  const lower = text.toLowerCase();
  if (!lower.includes(q)) return [{ text, match: false }];

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const idx = lower.indexOf(q, cursor);
    if (idx === -1) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (idx > cursor) {
      segments.push({ text: text.slice(cursor, idx), match: false });
    }
    segments.push({ text: text.slice(idx, idx + q.length), match: true });
    cursor = idx + q.length;
  }
  return segments;
}
