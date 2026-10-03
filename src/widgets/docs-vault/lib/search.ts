import type { VaultDoc } from '@/entities/docs-vault';
import { buildPhraseMatcher } from '@/shared/lib/highlight-match';
import type { DocsBodyEntry, DocsBodyIndex } from './body-index';
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

interface RankedDoc {
  doc: VaultDoc;
  score: number;
  order: number;
  titleIdx: number;
  excerptIdx: number;
  body: DocsBodyEntry | undefined;
  bodyIdx: number;
  bodyMatchLength: number;
}

function isWorse(a: RankedDoc, b: RankedDoc): boolean {
  return a.score < b.score || (a.score === b.score && a.order > b.order);
}

function retain(heap: RankedDoc[], entry: RankedDoc, limit: number): void {
  if (heap.length < limit) {
    heap.push(entry);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (!isWorse(heap[index], heap[parent])) break;
      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
    return;
  }
  heap[0] = entry;
  let index = 0;
  while (index * 2 + 1 < heap.length) {
    let child = index * 2 + 1;
    if (child + 1 < heap.length && isWorse(heap[child + 1], heap[child])) child += 1;
    if (!isWorse(heap[child], heap[index])) break;
    [heap[index], heap[child]] = [heap[child], heap[index]];
    index = child;
  }
}

function matchFor(
  doc: VaultDoc, score: number, titleIdx: number, excerptIdx: number,
  body: DocsBodyEntry | undefined, bodyIdx: number, bodyMatchLength: number, needleLength: number,
): DocsSearchMatch {
  return {
    doc, score,
    titleHit: titleIdx !== -1 ? { start: titleIdx, end: titleIdx + needleLength } : null,
    excerptHit: excerptIdx !== -1 ? { start: excerptIdx, end: excerptIdx + needleLength } : null,
    bodyHit: bodyIdx !== -1 && body !== undefined ? extractBodySnippet(body.raw, bodyIdx, bodyMatchLength) : null,
  };
}

/**
 * AND-token search. Tiers: title 20-100, slug 25, excerpt 2-20, tag 15, body phrase 10-16,
 * scattered body about 1. Body text is pre-lowercased; phrase matching shares the viewer's matcher.
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
  const bounded = Boolean(bodyIndex?.size) && Number.isInteger(maxResults) && maxResults > 0 && maxResults < docs.length;
  const heap: RankedDoc[] = [];
  let phraseRe: RegExp | null | undefined;
  let order = 0;
  for (const doc of docs) {
    const docOrder = order++;
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
        if (phraseRe === undefined) phraseRe = buildPhraseMatcher(q, 'i');
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
    if (bounded) {
      // Later ties cannot displace an earlier result. Build snippets only after the top prefix is known.
      if (heap.length === maxResults && score <= heap[0].score) continue;
      retain(heap, { doc, score, order: docOrder, titleIdx, excerptIdx, body, bodyIdx, bodyMatchLength }, maxResults);
    } else {
      out.push(matchFor(doc, score, titleIdx, excerptIdx, body, bodyIdx, bodyMatchLength, needle.length));
    }
  }
  if (bounded) {
    return heap.sort((a, b) => b.score - a.score || a.order - b.order)
      .map(entry => matchFor(entry.doc, entry.score, entry.titleIdx, entry.excerptIdx,
        entry.body, entry.bodyIdx, entry.bodyMatchLength, tokens[0].length));
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, maxResults);
}
