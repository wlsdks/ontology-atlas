import type { VaultDoc } from '@/entities/docs-vault';
import type { DocsBodyIndex } from './body-index';

/** 본문 히트 스니펫 — 매치 앞뒤 {@link BODY_SNIPPET_CONTEXT}자 문맥 + 스니펫
 *  내부 하이라이트 범위. */
export interface DocsBodySnippet {
  text: string;
  hit: { start: number; end: number };
}

export interface DocsSearchMatch {
  doc: VaultDoc;
  score: number;
  /** title 에서 match 된 범위 (첫 매치만). */
  titleHit: { start: number; end: number } | null;
  /** excerpt 에서 match 된 범위. */
  excerptHit: { start: number; end: number } | null;
  /** 본문 첫 매치의 ±60자 스니펫. bodyIndex 미제공/미매치면 null. */
  bodyHit: DocsBodySnippet | null;
}

/** 스니펫 문맥 반경 (매치 앞/뒤 각각). */
const BODY_SNIPPET_CONTEXT = 60;

/**
 * 본문 매치의 ±context 자 창을 잘라 한 줄 스니펫으로. 개행/탭은 길이 보존
 * 치환(공백)으로 눌러 하이라이트 오프셋이 어긋나지 않게 한다. 잘린 쪽엔
 * 생략부호를 붙이고 hit 범위를 그만큼 shift.
 */
export function extractBodySnippet(
  body: string,
  matchStart: number,
  matchLength: number,
  context = BODY_SNIPPET_CONTEXT,
): DocsBodySnippet {
  const windowStart = Math.max(0, matchStart - context);
  const windowEnd = Math.min(body.length, matchStart + matchLength + context);
  const slice = body
    .slice(windowStart, windowEnd)
    .replace(/[\n\r\t]/g, ' ');
  const prefix = windowStart > 0 ? '…' : '';
  const suffix = windowEnd < body.length ? '…' : '';
  const hitStart = prefix.length + (matchStart - windowStart);
  return {
    text: `${prefix}${slice}${suffix}`,
    hit: { start: hitStart, end: hitStart + matchLength },
  };
}

/**
 * 본문 티어 점수 — 어떤 메타데이터 히트(최저: excerpt 말단 매치 = 2점)보다도
 * 항상 낮도록 (1, 2) 구간에 가둔다. 본문끼리는 매치가 앞쪽일수록 근소 우위.
 */
function bodyTierScore(idx: number): number {
  return 1 + Math.max(0, 0.9 - idx / 10000);
}

/**
 * 단순한 client-side 전문 검색. 한 단어 / 공백 기준 AND 쿼리 지원.
 * score 규칙 (티어 순):
 *  - title 매치: 100점 - 매치 시작 인덱스 (앞쪽일수록 높음, 최저 20)
 *  - slug 매치: 25점
 *  - excerpt 매치: 20점 - min(매치 시작, 18) (최저 2)
 *  - tag 매치: 15점씩
 *  - body 매치: 1점대 (최하위 티어 — 어떤 메타데이터 히트도 본문 히트에
 *    밀리지 않는다. 본문끼리는 앞쪽 매치가 근소 우위)
 * 멀티 토큰은 모든 토큰이 title|excerpt|slug|tags|body 중 하나라도 매치해야
 * 포함. bodyIndex (사전 소문자 정규화, `body-index.ts`) 를 넘기면 본문
 * 티어가 활성화된다 — 305 docs 기준 선형 스캔 실측 ~0.1–0.2ms/키라
 * debounce·역색인 불필요.
 */
export function searchDocs(
  query: string,
  docs: VaultDoc[],
  maxResults = 30,
  bodyIndex?: DocsBodyIndex,
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
    const body = bodyIndex?.get(doc.slug);
    // 각 토큰이 어디든 매치하는지 AND 로 확인 (본문 포함)
    const allMatch = tokens.every(
      (tok) =>
        titleLc.includes(tok) ||
        excerptLc.includes(tok) ||
        slugLc.includes(tok) ||
        tagLc.some((t) => t.includes(tok)) ||
        (body !== undefined && body.lower.includes(tok)),
    );
    if (!allMatch) continue;
    // score 는 full query 기준으로 산출 (여러 토큰이면 joined 기준)
    const needle = tokens[0];
    const titleIdx = titleLc.indexOf(needle);
    const excerptIdx = excerptLc.indexOf(needle);
    const bodyIdx = body !== undefined ? body.lower.indexOf(needle) : -1;
    let score = 0;
    if (titleIdx !== -1) score += 100 - Math.min(titleIdx, 80);
    if (excerptIdx !== -1) score += 20 - Math.min(excerptIdx, 18);
    if (slugLc.includes(needle)) score += 25;
    for (const t of tagLc) if (t.includes(needle)) score += 15;
    if (bodyIdx !== -1) score += bodyTierScore(bodyIdx);
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
      bodyHit:
        bodyIdx !== -1 && body !== undefined
          ? extractBodySnippet(body.raw, bodyIdx, needle.length)
          : null,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, maxResults);
}
