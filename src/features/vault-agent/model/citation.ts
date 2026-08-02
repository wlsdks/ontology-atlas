import type { AnswerGrounding, CitedParagraph } from './types';

/**
 * 인용 강제 — 답을 렌더하기 전에 `[[slug]]` 인용을 검증한다.
 *
 * 규칙 셋:
 * ① **이 턴에 실제로 읽지 않은 slug 는 인용이 아니다.** 모델이 지어낸
 *    이름을 칩으로 만들면 누르는 순간 빈 곳으로 데려간다.
 * ② 근거의 판정은 **두 갈래**다 — 아래 참조.
 * ③ 모델이 쓴 마크다운 표기(`**굵게**` · 인라인 코드)는 화면에 글자로
 *    남지 않는다. 정보를 안 나르는 글자다.
 *
 * ## 왜 "인용 0" 하나로 판정하면 안 되나 (2026-08-02)
 *
 * 이 파일은 오래 `demoted: total === 0` 하나만 봤다. 인용 **표기**의 개수이지
 * 도구 호출과는 아무 상관이 없는 값이다. 실측 턴에서 도구를 4번 부르고
 * 1,370자를 읽어 화면에 「읽음: capabilities/checkout 635자」까지 찍어 놓고,
 * 네 줄 아래에서 「읽은 근거 없이 답했어요」가 떴다 — 모델이 `[[…]]` 대신
 * 백틱으로 이름을 적었기 때문이다. 화면이 자기 화면을 부정한 것이다.
 *
 * 그래서 갈래를 나눈다. 둘은 **다음 행동이 다르다**:
 *
 * - `unread` — 이 턴에 읽은 것이 하나도 없다. 근거가 없는 게 맞으니 강등하고,
 *   되돌아갈 길(다시 읽고 답하기)을 준다.
 * - `uncited` — 읽었는데 표기만 없다. 이건 고칠 문제가 아니라 **정확한
 *   자기 서술**이라 컨트롤을 붙이지 않는다. 화면이 읽은 목록을 「참고한 자료」
 *   칩으로 기계적으로 보정한다 — 모델 순응에 기대지 않는다.
 */

const CITATION_PATTERN = /\[\[([^[\]]+)\]\]/g;

export interface CitationResult {
  paragraphs: CitedParagraph[];
  grounding: AnswerGrounding;
  /** 읽은 적 없어 무효 처리된 이름들. 화면이 조용히 지우지 않고 알린다. */
  droppedCitations: string[];
}

export function extractCitations(text: string, readSlugs: readonly string[]): CitationResult {
  const allowed = new Set(readSlugs.map((slug) => slug.trim()).filter(Boolean));
  const allowedTails = new Map<string, string>();
  for (const slug of allowed) {
    const index = slug.lastIndexOf('/');
    if (index >= 0) allowedTails.set(slug.slice(index + 1), slug);
  }

  const dropped = new Set<string>();
  const paragraphs: CitedParagraph[] = [];

  for (const block of stripInlineMarkup(text).split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const citations: string[] = [];
    for (const match of trimmed.matchAll(CITATION_PATTERN)) {
      const raw = match[1].trim();
      const resolved = allowed.has(raw) ? raw : allowedTails.get(raw);
      if (resolved) {
        if (!citations.includes(resolved)) citations.push(resolved);
      } else {
        dropped.add(raw);
      }
    }
    paragraphs.push({ text: trimmed, citations });
  }

  const total = paragraphs.reduce((sum, paragraph) => sum + paragraph.citations.length, 0);
  return {
    paragraphs,
    grounding: total > 0 ? 'grounded' : allowed.size > 0 ? 'uncited' : 'unread',
    droppedCitations: [...dropped],
  };
}

const BOLD_PATTERN = /\*\*([^*\n]+)\*\*/g;
const INLINE_CODE_PATTERN = /`([^`\n]+)`/g;

/**
 * 모델이 쓴 인라인 마크다운 표기를 **글자 단위로 지운다** (렌더하지 않는다).
 *
 * 화면에 `**증거가 없는 기능(\`capability\`):**` 이 문자 그대로 찍히고 있었다.
 * 별표와 백틱은 이 표면에서 아무 정보도 나르지 않는다 — 대화 본문의 강조
 * 문법은 인용 칩이고, 그건 `[[…]]` 가 이미 맡고 있다.
 *
 * 코드 펜스(``` ) 안은 건드리지 않는다. 거기서는 백틱이 경계라서 지우면
 * 내용이 무너진다.
 */
function stripInlineMarkup(text: string): string {
  let inFence = false;
  return text
    .split('\n')
    .map((line) => {
      if (line.trimStart().startsWith('```')) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(BOLD_PATTERN, '$1').replace(INLINE_CODE_PATTERN, '$1');
    })
    .join('\n');
}
