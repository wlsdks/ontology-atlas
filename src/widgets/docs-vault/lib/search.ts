import type { VaultDoc } from '@/entities/docs-vault';
import { buildPhraseMatcher } from '@/shared/lib/highlight-match';
import type { DocsBodyIndex } from './body-index';
import { readDisplayLocales } from '@/shared/lib/locale-display-name';

/** A body hit snippet — {@link BODY_SNIPPET_CONTEXT} characters of context on each
 *  side of the match, plus the highlight range within the snippet. */
export interface DocsBodySnippet {
  text: string;
  hit: { start: number; end: number };
}

export interface DocsSearchMatch {
  doc: VaultDoc;
  score: number;
  /** The range matched in title (first match only). */
  titleHit: { start: number; end: number } | null;
  /** The range matched in excerpt. */
  excerptHit: { start: number; end: number } | null;
  /** A ±60-character snippet around the body's first match. null without a bodyIndex or a match. */
  bodyHit: DocsBodySnippet | null;
}

/** Snippet context radius (before and after the match). */
const BODY_SNIPPET_CONTEXT = 60;

/**
 * Cut a ±context window around a body match into a one-line snippet. Newlines and
 * tabs are replaced by spaces of the same length so highlight offsets stay aligned.
 * Clipped sides get an ellipsis and the hit range shifts accordingly.
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
 * Body tier score, clamped into (1, 2) so it stays below every metadata hit; an earlier match wins
 * by a hair.
 */
function bodyTierScore(idx: number): number {
  return 1 + Math.max(0, 0.9 - idx / 10000);
}

/**
 * Exact-phrase body boost, clamped into (10, 16] so it beats scattered tokens but never the title
 * minimum of 20.
 */
function bodyPhraseScore(idx: number): number {
  return 10 + Math.max(0, 6 - idx / 10000);
}

/**
 * Client-side full-text search with whitespace-separated AND tokens. Tiers: title 100 minus index
 * (min 20), slug 25, excerpt 20 minus min(index, 18), tag 15 each, body exact phrase 10-16,
 * scattered body about 1. The body tier is a linear indexOf scan over the pre-lowercased index
 * (`body-index.ts`), and phrase detection shares `buildPhraseMatcher` with the viewer so every
 * match can be marked and scrolled to.
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
    // Also match the display name the list draws; this only widens the scope.
    const displayLc = Object.values(readDisplayLocales(doc.frontmatter) ?? {}).map((v) =>
      v.toLowerCase(),
    );
    const body = bodyIndex?.get(doc.slug);
    // Check with AND that each token matches somewhere (body included).
    const allMatch = tokens.every(
      (tok) =>
        titleLc.includes(tok) ||
        displayLc.some((d) => d.includes(tok)) ||
        excerptLc.includes(tok) ||
        slugLc.includes(tok) ||
        tagLc.some((t) => t.includes(tok)) ||
        (body !== undefined && body.lower.includes(tok)),
    );
    if (!allMatch) continue;
    // The score is computed against the full query (the joined form for multiple tokens).
    const needle = tokens[0];
    const titleIdx = titleLc.indexOf(needle);
    const excerptIdx = excerptLc.indexOf(needle);

    // Body match position: an exact phrase (newlines as spaces) sets the boost tier; otherwise the
    // first token's position in the lowest tier.
    let bodyIdx = -1;
    let bodyMatchLength = needle.length;
    let bodyPhraseMatched = false;
    if (body !== undefined) {
      if (tokens.length > 1) {
        const phraseRe = buildPhraseMatcher(q, 'i');
        const phraseMatch = phraseRe?.exec(body.raw) ?? null;
        if (phraseMatch) {
          bodyIdx = phraseMatch.index;
          bodyMatchLength = phraseMatch[0].length;
          bodyPhraseMatched = true;
        }
      }
      if (bodyIdx === -1) {
        bodyIdx = body.lower.indexOf(needle);
        bodyMatchLength = needle.length;
      }
    }

    let score = 0;
    if (titleIdx !== -1) score += 100 - Math.min(titleIdx, 80);
    if (excerptIdx !== -1) score += 20 - Math.min(excerptIdx, 18);
    if (slugLc.includes(needle)) score += 25;
    for (const t of tagLc) if (t.includes(needle)) score += 15;
    if (bodyIdx !== -1) {
      score += bodyPhraseMatched
        ? bodyPhraseScore(bodyIdx)
        : bodyTierScore(bodyIdx);
    }
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
          ? extractBodySnippet(body.raw, bodyIdx, bodyMatchLength)
          : null,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, maxResults);
}
