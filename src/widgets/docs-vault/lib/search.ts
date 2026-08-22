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
 * The body tier's score — clamped into (1, 2) so it is always below any metadata
 * hit (the lowest being an excerpt match at the tail, 2 points). Among bodies, an
 * earlier match wins by a hair. This tier applies to scattered multi-token AND
 * matches, where the phrase is not actually contiguous.
 */
function bodyTierScore(idx: number): number {
  return 1 + Math.max(0, 0.9 - idx / 10000);
}

/**
 * The body "exact phrase" boost — restoring ranking trust (P1 review #2). Far above
 * a scattered token AND match, but clamped into (10, 16] so it can never beat the
 * title hit's minimum (20; see the `titleIdx` clamp above `bodyTierScore`). idx 0
 * (an exact phrase at the very start of the document) takes the maximum, and it
 * approaches 10 further in.
 */
function bodyPhraseScore(idx: number): number {
  return 10 + Math.max(0, 6 - idx / 10000);
}

/**
 * A simple client-side full-text search, supporting single-word and
 * whitespace-separated AND queries.
 *
 * Scoring rules, by tier:
 *  - title match: 100 − the match start index (earlier scores higher; minimum 20)
 *  - slug match: 25
 *  - excerpt match: 20 − min(match start, 18) (minimum 2)
 *  - tag match: 15 each
 *  - body match (scattered tokens): around 1 — the lowest tier, so no metadata hit
 *    ever loses to a body hit. Among bodies, an earlier match wins by a hair.
 *  - body match (exact phrase — a multi-token query present contiguously in the
 *    body): 10–16 (P1 review #2 — more trustworthy than a scattered token match, so
 *    it ranks higher, but still cannot beat the title minimum of 20)
 *
 * For multi-token queries, every token must match at least one of
 * title|excerpt|slug|tags|body to be included (they need not form a phrase — that
 * is the AND requirement). Passing bodyIndex (pre-lowercased, `body-index.ts`)
 * activates the body tier — a linear scan over 305 docs measures ~0.1–0.2ms/key, so
 * neither debouncing nor an inverted index is needed. Exact-phrase detection reuses
 * `buildPhraseMatcher` (shared, `shared/lib/highlight-match.ts`), so it uses the
 * same whitespace-flexible rule (newlines count as spaces) as the viewer's
 * highlight matching — what search calls a match must actually be markable and
 * scrollable in the viewer (consistency between ranking and landing).
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
    // It must also be findable by the name the list draws (`display_ko` /
    // `display_en`) — what a user types is usually the name they just read on
    // screen. This only widens the scope, so anyone searching by the raw title is
    // unaffected.
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

    // The body match position — for a multi-token query, first look for an exact
    // phrase (whitespace-flexible, newlines counting as spaces). If found, its
    // position and length drive the boost tier; if not (tokens scattered), fall back
    // to the first token's position in the lowest tier, as before.
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
