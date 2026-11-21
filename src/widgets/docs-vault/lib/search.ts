import type { VaultDoc } from '@/entities/docs-vault';
import { buildExcerpt } from '@/shared/lib/vault-document/parse-frontmatter';
import { buildPhraseMatcher } from '@/shared/lib/search-match/highlight-match';
import { stripFrontmatterBlock, type DocsBodyEntry, type DocsBodyIndex } from './body-index';
import { readDisplayLocales } from '@/shared/lib/locale-text/locale-display-name';

export interface DocsBodySnippet {
  text: string;
  hit: { start: number; end: number };
}

export interface DocsSearchMatch {
  doc: VaultDoc;
  score: number;
  titleHit: { start: number; end: number } | null;
  summaryHit: { start: number; end: number } | null;
  bodyHit: DocsBodySnippet | null;
}

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
function bodyTierScore(matchIndex: number): number {
  return 1 + Math.max(0, 0.9 - matchIndex / 10000);
}

/**
 * Exact-phrase body boost, clamped into (10, 16] so it beats scattered tokens but never the title
 * minimum of 20.
 */
function bodyPhraseScore(matchIndex: number): number {
  return 10 + Math.max(0, 6 - matchIndex / 10000);
}

const excerptLowerByEntry = new WeakMap<DocsBodyEntry, string>();

function indexedExcerptLower(entry: DocsBodyEntry): string {
  let lower = excerptLowerByEntry.get(entry);
  if (lower === undefined) {
    lower = buildExcerpt(stripFrontmatterBlock(entry.raw)).toLowerCase();
    excerptLowerByEntry.set(entry, lower);
  }
  return lower;
}

interface RankedDoc {
  doc: VaultDoc;
  score: number;
  order: number;
  titleIndex: number;
  summaryIndex: number;
  body: DocsBodyEntry | undefined;
  bodyMatchIndex: number;
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
  doc: VaultDoc, score: number, titleIndex: number, summaryIndex: number,
  body: DocsBodyEntry | undefined, bodyMatchIndex: number, bodyMatchLength: number, needleLength: number,
): DocsSearchMatch {
  return {
    doc, score,
    titleHit: titleIndex !== -1 ? { start: titleIndex, end: titleIndex + needleLength } : null,
    summaryHit: summaryIndex !== -1 ? { start: summaryIndex, end: summaryIndex + needleLength } : null,
    bodyHit: bodyMatchIndex !== -1 && body !== undefined ? extractBodySnippet(body.raw, bodyMatchIndex, bodyMatchLength) : null,
  };
}

/**
 * AND-token search. Tiers: title 20-100, slug 25, summary or an indexed body's first paragraph
 * 2-20, tag 15, body phrase 10-16, scattered body about 1. Body text is pre-lowercased; phrase
 * matching shares the viewer's matcher.
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
    const summaryLc = (doc.description || doc.definitionPreview || '').toLowerCase();
    const slugLc = doc.slug.toLowerCase();
    const tagLc = doc.tags.map((t) => t.toLowerCase());
    const displayLc = Object.values(readDisplayLocales(doc.frontmatter) ?? {}).map((v) =>
      v.toLowerCase(),
    );
    const body = bodyIndex?.get(doc.slug);
    const excerptLc = body ? indexedExcerptLower(body) : '';
    const allMatch = tokens.every(
      (tok) =>
        titleLc.includes(tok) ||
        displayLc.some((d) => d.includes(tok)) ||
        summaryLc.includes(tok) ||
        excerptLc.includes(tok) ||
        slugLc.includes(tok) ||
        tagLc.some((t) => t.includes(tok)) ||
        (body !== undefined && body.lower.includes(tok)),
    );
    if (!allMatch) continue;
    // The score is computed against the full query (the joined form for multiple tokens).
    const needle = tokens[0];
    const titleIndex = titleLc.indexOf(needle);
    const summaryIndex = summaryLc.indexOf(needle);
    const excerptIndex = excerptLc.indexOf(needle);
    const leadIndex = summaryIndex === -1 || (excerptIndex !== -1 && excerptIndex < summaryIndex) ? excerptIndex : summaryIndex;

    // Body match position: an exact phrase (newlines as spaces) sets the boost tier; otherwise the
    // first token's position in the lowest tier.
    let bodyMatchIndex = -1;
    let bodyMatchLength = needle.length;
    let bodyPhraseMatched = false;
    if (body !== undefined) {
      if (tokens.length > 1) {
        if (phraseRe === undefined) phraseRe = buildPhraseMatcher(q, 'i');
        const phraseMatch = phraseRe?.exec(body.raw) ?? null;
        if (phraseMatch) {
          bodyMatchIndex = phraseMatch.index;
          bodyMatchLength = phraseMatch[0].length;
          bodyPhraseMatched = true;
        }
      }
      if (bodyMatchIndex === -1) {
        bodyMatchIndex = body.lower.indexOf(needle);
        bodyMatchLength = needle.length;
      }
    }

    let score = 0;
    if (titleIndex !== -1) score += 100 - Math.min(titleIndex, 80);
    if (leadIndex !== -1) score += 20 - Math.min(leadIndex, 18);
    if (slugLc.includes(needle)) score += 25;
    for (const t of tagLc) if (t.includes(needle)) score += 15;
    if (bodyMatchIndex !== -1) {
      score += bodyPhraseMatched
        ? bodyPhraseScore(bodyMatchIndex)
        : bodyTierScore(bodyMatchIndex);
    }
    if (bounded) {
      // Later ties cannot displace an earlier result. Build snippets only after the top prefix is known.
      if (heap.length === maxResults && score <= heap[0].score) continue;
      retain(heap, { doc, score, order: docOrder, titleIndex, summaryIndex, body, bodyMatchIndex, bodyMatchLength }, maxResults);
    } else {
      out.push(matchFor(doc, score, titleIndex, summaryIndex, body, bodyMatchIndex, bodyMatchLength, needle.length));
    }
  }
  if (bounded) {
    return heap.sort((a, b) => b.score - a.score || a.order - b.order)
      .map(entry => matchFor(entry.doc, entry.score, entry.titleIndex, entry.summaryIndex,
        entry.body, entry.bodyMatchIndex, entry.bodyMatchLength, tokens[0].length));
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, maxResults);
}
