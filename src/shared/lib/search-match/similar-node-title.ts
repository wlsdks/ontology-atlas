/**
 * GUI port of `detectDuplicateTitle` and `findNearTitleMatches`
 * (`mcp/src/ontology-engine/growth-hint.mjs`); `mcp/` is a separate package, so it is not imported.
 * A match needs the same kind: same-named nodes of different kinds are legitimate.
 */

export interface SimilarNodeCandidate {
  slug: string;
  title: string;
  kind: string;
}

export interface SimilarNodeMatch extends SimilarNodeCandidate {
  /** 1 = exact match after normalisation; otherwise Jaccard token overlap (0 to <1). */
  score: number;
}

export interface FindSimilarNodeOptions {
  excludeSlug?: string;
  /**
   * Higher than the read-tool hint's 0.3 (`growth-hint.mjs`): this warns while the user types, and
   * false alarms teach people to ignore it.
   */
  minScore?: number;
}

const DEFAULT_MIN_SCORE = 0.6;
// Unicode classes, as `slugify.ts` uses: the ASCII-only pattern in `growth-hint.mjs` cannot
// tokenise Korean titles.
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

function titleSimilarity(a: string, b: string): number {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }
  if (intersection === 0) return 0;
  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

/**
 * Given the title being typed for a new node, return the single highest-scoring
 * close match among existing candidates of the same `kind`, or null.
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

  let best: SimilarNodeMatch | null = null;
  for (const candidate of candidates) {
    if (!candidate || candidate.kind !== kind) continue;
    if (options.excludeSlug && candidate.slug === options.excludeSlug) continue;
    if (!normalizeTitle(candidate.title)) continue;

    // An exact match (1) always counts; partial overlap must clear minScore.
    const score = titleSimilarity(title, candidate.title);
    if (score === 0) continue;
    if (score < 1 && score < minScore) continue;

    if (!best || score > best.score) {
      best = { slug: candidate.slug, title: candidate.title, kind: candidate.kind, score };
    }
  }
  return best;
}
