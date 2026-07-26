import type { CitedParagraph } from './types';

/**
 * 인용 강제 — 답을 렌더하기 전에 `[[slug]]` 인용을 검증한다.
 *
 * 규칙 둘:
 * ① 인용이 하나도 없는 답은 **강등**해서 그린다. 근거 없이 말한 문장을
 *    근거 있는 문장과 똑같이 그리면 화면이 거짓말을 한다.
 * ② **이 턴에 실제로 읽지 않은 slug 는 인용이 아니다.** 모델이 지어낸
 *    이름을 칩으로 만들면 누르는 순간 빈 곳으로 데려간다.
 */

const CITATION_PATTERN = /\[\[([^[\]]+)\]\]/g;

export interface CitationResult {
  paragraphs: CitedParagraph[];
  /** 인용 0 — 렌더 강등. */
  demoted: boolean;
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

  for (const block of text.split(/\n{2,}/)) {
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
    demoted: total === 0,
    droppedCitations: [...dropped],
  };
}
