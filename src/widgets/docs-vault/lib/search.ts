import type { VaultDoc } from '@/entities/docs-vault';

export interface DocsSearchMatch {
  doc: VaultDoc;
  score: number;
  /** title 에서 match 된 범위 (첫 매치만). */
  titleHit: { start: number; end: number } | null;
  /** excerpt 에서 match 된 범위. */
  excerptHit: { start: number; end: number } | null;
}

/**
 * 단순한 client-side 전문 검색. 한 단어 / 공백 기준 AND 쿼리 지원.
 * score 규칙:
 *  - title 매치: 100점 - 매치 시작 인덱스 (앞쪽일수록 높음)
 *  - excerpt 매치: 20점 - min(매치 시작, 20)
 *  - tag 매치: 15점씩
 *  - slug 매치: 25점
 * 멀티 토큰은 모든 토큰이 title|excerpt|slug|tags 중 하나라도 매치해야 포함.
 */
export function searchDocs(
  query: string,
  docs: VaultDoc[],
  maxResults = 30,
): DocsSearchMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const out: DocsSearchMatch[] = [];
  for (const doc of docs) {
    const titleLc = doc.title.toLowerCase();
    const excerptLc = doc.excerpt.toLowerCase();
    const slugLc = doc.slug.toLowerCase();
    const tagLc = doc.tags.map((t) => t.toLowerCase());
    // 각 토큰이 어디든 매치하는지 AND 로 확인
    const allMatch = tokens.every(
      (tok) =>
        titleLc.includes(tok) ||
        excerptLc.includes(tok) ||
        slugLc.includes(tok) ||
        tagLc.some((t) => t.includes(tok)),
    );
    if (!allMatch) continue;
    // score 는 full query 기준으로 산출 (여러 토큰이면 joined 기준)
    const needle = tokens[0];
    const titleIdx = titleLc.indexOf(needle);
    const excerptIdx = excerptLc.indexOf(needle);
    let score = 0;
    if (titleIdx !== -1) score += 100 - Math.min(titleIdx, 80);
    if (excerptIdx !== -1) score += 20 - Math.min(excerptIdx, 18);
    if (slugLc.includes(needle)) score += 25;
    for (const t of tagLc) if (t.includes(needle)) score += 15;
    out.push({
      doc,
      score,
      titleHit:
        titleIdx !== -1
          ? { start: titleIdx, end: titleIdx + needle.length }
          : null,
      excerptHit:
        excerptIdx !== -1
          ? { start: excerptIdx, end: excerptIdx + needle.length }
          : null,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, maxResults);
}
