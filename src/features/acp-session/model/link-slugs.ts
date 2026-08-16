/**
 * 채팅 글에서 **실재하는 노드 이름**을 집어낸다.
 *
 * ## 왜 「아는 이름만」인가 (2026-08-17 소유자 지시)
 *
 * 소유자: *"채팅에서 마우스만 올려도 우리 노드에 표시된다거나"*. 그러려면 글
 * 안의 어느 글자가 노드인지 알아야 한다.
 *
 * 흔한 방식 — `a/b` 모양이면 전부 링크 — 은 여기서 못 쓴다. 에이전트의 답에는
 * 파일 경로(`src/features/acp-session/model/x.ts`) · URL · 날짜가 널려 있고,
 * 그걸 전부 노드로 만들면 **눌러도 아무 데도 안 가는 링크가 글자마다 생긴다.**
 * 한 번 그런 링크를 만나면 사람은 나머지 링크도 안 누른다.
 *
 * 우리는 그래프를 갖고 있으니 짐작할 이유가 없다: **아는 이름만 집는다.**
 * 오탐이 0이고, 새 노드가 생기면 그날부터 자동으로 집힌다.
 *
 * ## 경계 규칙
 *
 * 앞뒤가 글자면 안 집는다(`xcapabilities/invoicey` 는 다른 이름이다). 대신
 * 괄호 · 따옴표 · 마침표 · 백틱 옆은 집는다 — 문장에서 실제로 그렇게 쓴다.
 * 그리고 **긴 이름을 먼저** 본다: 짧은 쪽을 먼저 집으면 `a/b-c` 가
 * `a/b` + `-c` 로 잘린다.
 */

export interface PlainSegment {
  text: string;
}

export interface SlugSegment {
  text: string;
  slug: string;
}

export type LinkedSegment = PlainSegment | SlugSegment;

/** 이름의 일부가 아니라 **독립한 낱말**인가. */
const WORD_CHAR = /[A-Za-z0-9_/.-]/;

function isBoundary(char: string | undefined): boolean {
  if (char === undefined) return true;
  return !WORD_CHAR.test(char);
}

/**
 * 이름 **뒤쪽** 경계. 마침표 하나 때문에 앞과 규칙이 다르다:
 * `capabilities/invoice.md` 의 `.` 는 확장자라서 이름의 일부이고,
 * `capabilities/invoice.` 의 `.` 는 문장 끝이라 경계다. 가르는 것은 그
 * 마침표 **다음 글자**다.
 */
function isTrailingBoundary(text: string, at: number): boolean {
  const char = text[at];
  if (char === undefined) return true;
  if (char === '.') return !/[A-Za-z0-9]/.test(text[at + 1] ?? '');
  return !WORD_CHAR.test(char);
}

export function linkSlugs(text: string, known: ReadonlySet<string>): LinkedSegment[] {
  if (text.length === 0) return [];
  if (known.size === 0) return [{ text }];

  // 긴 이름이 먼저다 — 짧은 쪽이 먼저 물면 뒤가 잘린다.
  const candidates = [...known].filter((s) => s.length > 0).sort((a, b) => b.length - a.length);

  const out: LinkedSegment[] = [];
  let cursor = 0;
  let plainFrom = 0;

  outer: while (cursor < text.length) {
    for (const slug of candidates) {
      if (!text.startsWith(slug, cursor)) continue;
      // 앞뒤가 글자면 이름의 일부일 뿐이다. `.md` 같은 꼬리도 여기서 걸린다 —
      // `capabilities/invoice.md` 는 파일이지 그 노드 참조가 아니다.
      if (!isBoundary(text[cursor - 1])) continue;
      if (!isTrailingBoundary(text, cursor + slug.length)) continue;

      if (plainFrom < cursor) out.push({ text: text.slice(plainFrom, cursor) });
      out.push({ text: slug, slug });
      cursor += slug.length;
      plainFrom = cursor;
      continue outer;
    }
    cursor += 1;
  }

  if (plainFrom < text.length) out.push({ text: text.slice(plainFrom) });
  return out;
}
