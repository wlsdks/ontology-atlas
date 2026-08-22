/**
 * Near-duplicate detection for nodes created through the GUI.
 *
 * Combines `detectDuplicateTitle` from `mcp/src/vault.mjs` (normalised *exact*
 * match only) and `findNearTitleMatches` from `mcp/src/growth-hint.mjs` (Jaccard
 * token overlap) into one pure function. `mcp/` is a separate package and is never
 * imported from `src/`, so the logic is ported rather than shared
 * (`.claude/rules/architecture.md`); there is no vault I/O here.
 *
 * The #1 failure mode of a growing vault is duplicate or hallucinated nodes, and
 * the safety net existed only on the MCP `add_concept` path — the GUI creation
 * paths had none. This module fills that gap.
 *
 * A match requires **a close title *and* the same kind.** Same-named nodes of
 * different kinds (a domain "결제" and a capability "결제") are common and
 * legitimate, so pairing them would only produce false alarms.
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
  /** Exclude the node currently being edited from the candidates. */
  excludeSlug?: string;
  /**
   * Minimum Jaccard score; below it the titles are treated as different concepts.
   * Set higher than the read-tool hint in `growth-hint.mjs` (0.3) because this
   * warning appears actively as the user types, so a false alarm costs more — a
   * threshold set too low teaches people to ignore it. The default 0.6 fires only
   * when more than half the tokens overlap.
   */
  minScore?: number;
}

const DEFAULT_MIN_SCORE = 0.6;
// The TOKEN_RE in growth-hint.mjs (`[a-z0-9]+`) is ASCII-only and cannot tokenise
// Korean titles, which most titles in this vault are. Widened to the \p{L}\p{N}
// unicode classes — the same pattern `slugify.ts` already uses.
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
 * Closeness of two titles (0–1): 1 for an exact match after normalisation,
 * otherwise Jaccard token overlap. This is the pairwise core of
 * `findSimilarNodeByTitle` with no kind gate, exposed so the picker's
 * "similar name" suggestion reuses the same formula instead of growing a second
 * one.
 */
export function titleSimilarity(a: string, b: string): number {
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
