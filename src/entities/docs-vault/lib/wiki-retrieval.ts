import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { isWikiFurnitureSlug } from '@/shared/lib/wiki-page-schema';

import type { VaultDoc } from '../model/types';
import { isWikiPage } from './vault-library';

export interface WikiRetrievalResult {
  /** Suggestions only: no currentness, entailment, or complete-read claim. */
  candidates: { slug: string; title: string; sameSource: boolean; matchedTerms: string[] }[];
  searchedPages: number;
  /** Pages with bodies in the Library cache; the rest match on metadata. */
  fullTextPages: number;
  limit: number;
  omittedMatches: number;
}

const LIMIT = 3;
const STOP = new Set('a an and are as at be been by can do for from has have in is it its of on or that the their this to was were will with summary facts decisions open questions not sources human note'.split(' '));

function terms(text: string): Map<string, number> {
  const found = new Map<string, number>();
  // Citation addresses and Markdown destinations are identity, not topical evidence.
  const prose = text.replace(/\[\[(?:src:)?[^\]]+\]\]/g, ' ').replace(/\]\([^)]*\)/g, ']');
  for (const word of prose.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (word.length < 2 || word.length > 64 || !/\p{L}/u.test(word) || STOP.has(word)) continue;
    found.set(word, 1);
    // Korean particles attach to nouns, so bigrams give a lexical fallback; exact terms rank higher.
    if (/^[가-힣]{3,}$/u.test(word)) {
      for (let i = 0; i < word.length - 1; i++) {
        const gram = word.slice(i, i + 2);
        if (!found.has(gram)) found.set(gram, 0.25);
      }
    }
  }
  return found;
}

/** Built when a Compile turn starts, from Library data already read; no I/O. */
export function buildWikiRetrievalIndex(docs: readonly VaultDoc[], rawBySlug: ReadonlyMap<string, string> = new Map()) {
  const frequencies = new Map<string, number>();
  const pages = docs.filter((doc) => isWikiPage(doc) && !isWikiFurnitureSlug(doc.slug)
    && !/[\\#?\x00-\x1f\x7f]/.test(doc.slug) && !doc.slug.endsWith('.md')
    && doc.slug.split('/').every((part) => part && !part.startsWith('.') && !part.startsWith('_')))
    .map((doc) => {
      const raw = rawBySlug.get(doc.slug);
      const parsed = raw === undefined ? null : parseFrontmatter(raw);
      const frontmatter = parsed?.frontmatter ?? doc.frontmatter;
      const sourceValue = frontmatter.sources;
      const sources = new Set((Array.isArray(sourceValue) ? sourceValue : [sourceValue])
        .filter((value): value is string => typeof value === 'string').map((value) => value.trim()));
      const body = parsed?.body ?? [doc.excerpt, doc.description ?? '', ...doc.tags].join(' ');
      const weights = terms(body);
      for (const [term, weight] of terms(doc.title)) weights.set(term, (weights.get(term) ?? 0) + weight * 2);
      for (const term of weights.keys()) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
      return { slug: doc.slug, title: doc.title, sources, weights, hasBody: raw !== undefined };
    });
  const fullTextPages = pages.filter((page) => page.hasBody).length;

  return {
    search(sourcePath: string, sourceText: string): WikiRetrievalResult {
      const query = terms(parseFrontmatter(sourceText).body);
      const ranked = pages.map((page) => {
        const matched = [...query].flatMap(([term, weight]) => {
          const pageWeight = page.weights.get(term);
          if (!pageWeight) return [];
          const rarity = Math.log(1 + pages.length / (frequencies.get(term) ?? 1));
          return [{ term, score: weight * pageWeight * rarity }];
        }).sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
        return {
          page, sameSource: page.sources.has(sourcePath), matched,
          score: matched.reduce((sum, match) => sum + match.score, 0) / Math.sqrt(Math.max(16, page.weights.size)),
        };
      }).filter((match) => match.sameSource || match.score > 0)
        .sort((a, b) => Number(b.sameSource) - Number(a.sameSource) || b.score - a.score || a.page.slug.localeCompare(b.page.slug));
      return {
        candidates: ranked.slice(0, LIMIT).map(({ page, sameSource, matched }) => ({
          slug: page.slug, title: page.title.slice(0, 200), sameSource,
          matchedTerms: matched.slice(0, 6).map((match) => match.term),
        })),
        searchedPages: pages.length, fullTextPages, limit: LIMIT,
        omittedMatches: Math.max(0, ranked.length - LIMIT),
      };
    },
  };
}
