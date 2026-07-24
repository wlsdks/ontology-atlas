/**
 * GUI 노드 생성 근접 중복 감지 — design-council B2 rank4.
 *
 * `mcp/src/vault.mjs` 의 `detectDuplicateTitle`(정규화 후 *완전 일치*만)과
 * `mcp/src/growth-hint.mjs` 의 `findNearTitleMatches`(토큰 오버랩 Jaccard) 를
 * 하나로 합쳐 GUI 용으로 재구현한 버전 — `mcp/` 는 별도 npm 패키지라 `src/`
 * 에서 직접 import 하지 않는다(단일 진실원 원칙, `.claude/rules/architecture.md`).
 * 로직만 이식하고 vault I/O 는 없다 — 순수 함수.
 *
 * AGENTS.md: "성장하는 vault 의 #1 실패 모드는 중복/hallucinated 노드" — 지금은
 * MCP `add_concept` 경로에만 안전망이 있고, `/docs` 새 문서·`/ontology/studio`
 * (나침 무대 CREATE) 두 GUI 경로엔 없다. 이 모듈이 그 공백을 메운다.
 *
 * 임계는 **제목 근접 + kind 일치**일 때만 — 다른 kind 의 동명 노드(예: "결제"
 * 라는 domain 과 "결제" 라는 capability)는 흔하고 정상이라 오경보가 된다.
 */

export interface SimilarNodeCandidate {
  slug: string;
  title: string;
  kind: string;
}

export interface SimilarNodeMatch extends SimilarNodeCandidate {
  /** 1 = 정규화 후 완전 일치. 그 외는 Jaccard 토큰 오버랩(0~1 미만). */
  score: number;
}

export interface FindSimilarNodeOptions {
  /** 자기 자신(편집 중인 노드)을 후보에서 제외. */
  excludeSlug?: string;
  /**
   * Jaccard 최소 점수 — 이 아래는 "다른 개념"으로 본다. growth-hint.mjs 의
   * read-tool 힌트(0.3)보다 높게 잡는다 — 여긴 타이핑마다 뜨는 능동적
   * 경고라 오경보 비용이 더 크다(council guardianRisk: "임계 너무 낮으면
   * 오경보 학습"). 기본 0.6 = 토큰 절반 이상 겹칠 때만.
   */
  minScore?: number;
}

const DEFAULT_MIN_SCORE = 0.6;
// growth-hint.mjs 의 TOKEN_RE(`[a-z0-9]+`)는 ASCII 전용이라 한글 title 을
// 토큰화하지 못한다(이 vault 의 다수 title 이 한글). \p{L}\p{N} 유니코드
// 클래스로 확장 — `slugify.ts` 가 이미 쓰는 것과 같은 패턴.
const TOKEN_RE = /[\p{L}\p{N}]+/gu;

function tokenize(text: string): string[] {
  return (String(text ?? "").toLowerCase().match(TOKEN_RE) ?? []) as string[];
}

function normalizeTitle(text: string): string {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * `title`(작성 중인 새 노드 제목) 이 `kind` 가 같은 기존 후보 중 근접한 것이
 * 있으면 최고 점수 매치 하나를 반환, 없으면 null.
 */
export function findSimilarNodeByTitle(
  title: string,
  kind: string,
  candidates: readonly SimilarNodeCandidate[],
  options: FindSimilarNodeOptions = {},
): SimilarNodeMatch | null {
  const normTitle = normalizeTitle(title);
  if (!normTitle || !kind) return null;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const queryTokens = new Set(tokenize(title));

  let best: SimilarNodeMatch | null = null;
  for (const candidate of candidates) {
    if (!candidate || candidate.kind !== kind) continue;
    if (options.excludeSlug && candidate.slug === options.excludeSlug) continue;
    const candidateNorm = normalizeTitle(candidate.title);
    if (!candidateNorm) continue;

    let score: number;
    if (candidateNorm === normTitle) {
      score = 1;
    } else {
      const candidateTokens = new Set(tokenize(candidate.title));
      if (queryTokens.size === 0 || candidateTokens.size === 0) continue;
      let intersection = 0;
      for (const token of queryTokens) {
        if (candidateTokens.has(token)) intersection += 1;
      }
      if (intersection === 0) continue;
      const union = new Set([...queryTokens, ...candidateTokens]).size;
      score = intersection / union;
      if (score < minScore) continue;
    }

    if (!best || score > best.score) {
      best = { slug: candidate.slug, title: candidate.title, kind: candidate.kind, score };
    }
  }
  return best;
}
