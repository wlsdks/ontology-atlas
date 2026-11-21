import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';
import { isWikiFurnitureSlug } from '@/shared/lib/library/wiki-page-schema';

import type { VaultDoc } from '../../model/vault-manifest';
import { isWikiPage } from './wiki-page-facts';

export interface WikiRetrievalResult {
  /** Suggestions only: no currentness, entailment, or complete-read claim. */
  candidates: { slug: string; title: string; sameSource: boolean; matchedTerms: string[] }[];
  searchedPages: number;
  fullTextPages: number;
  limit: number;
  omittedMatches: number;
}

/**
 * What retrieval keeps of one page read, so its body need not stay: the `sources:` it declares and
 * its body terms by weight (`words` 1, `grams` 0.25), each string shared through `intern`.
 */
export interface WikiRetrievalPage {
  readonly sources: readonly string[];
  readonly words: readonly string[];
  readonly grams: readonly string[];
}

export type WikiTermIntern = (terms: readonly string[]) => readonly string[];

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

/** A term table for one folder: each distinct term is copied once, by `JSON`, so no page text stays reachable. */
export function createWikiTermIntern(): WikiTermIntern {
  const kept = new Map<string, string>();
  return (values) => {
    const fresh = values.filter((value) => !kept.has(value));
    if (fresh.length > 0) {
      const copies = JSON.parse(JSON.stringify(fresh)) as string[];
      fresh.forEach((value, at) => kept.set(copies[at]!, copies[at]!));
    }
    return values.map((value) => kept.get(value)!);
  };
}

/** O(page bytes): what `buildWikiRetrievalIndex` needs of a page, from its text. */
export function wikiRetrievalPage(raw: string, intern: WikiTermIntern = createWikiTermIntern()): WikiRetrievalPage {
  const parsed = parseFrontmatter(raw);
  const sourceValue = parsed.frontmatter.sources;
  const sources = [...new Set((Array.isArray(sourceValue) ? sourceValue : [sourceValue])
    .filter((value): value is string => typeof value === 'string').map((value) => value.trim()))];
  const words: string[] = [];
  const grams: string[] = [];
  for (const [term, weight] of terms(parsed.body)) (weight === 1 ? words : grams).push(term);
  return { sources: intern(sources), words: intern(words), grams: intern(grams) };
}

/** Built when a Compile turn starts, from Library data already read; no I/O. O(pages · terms). */
export function buildWikiRetrievalIndex(docs: readonly VaultDoc[], readPages: ReadonlyMap<string, WikiRetrievalPage> = new Map()) {
  const frequencies = new Map<string, number>();
  const pages = docs.filter((doc) => isWikiPage(doc) && !isWikiFurnitureSlug(doc.slug)
    && !/[\\#?\x00-\x1f\x7f]/.test(doc.slug) && !doc.slug.endsWith('.md')
    && doc.slug.split('/').every((part) => part && !part.startsWith('.') && !part.startsWith('_')))
    .map((doc) => {
      const read = readPages.get(doc.slug);
      let sources: Set<string>;
      let weights: Map<string, number>;
      if (read) {
        sources = new Set(read.sources);
        weights = new Map<string, number>();
        for (const term of read.words) weights.set(term, 1);
        for (const term of read.grams) weights.set(term, 0.25);
      } else {
        const sourceValue = doc.frontmatter.sources;
        sources = new Set((Array.isArray(sourceValue) ? sourceValue : [sourceValue])
          .filter((value): value is string => typeof value === 'string').map((value) => value.trim()));
        weights = terms([doc.title, doc.description ?? '', doc.definitionPreview ?? '', ...doc.tags].join(' '));
      }
      for (const [term, weight] of terms(doc.title)) weights.set(term, (weights.get(term) ?? 0) + weight * 2);
      for (const term of weights.keys()) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
      return { slug: doc.slug, title: doc.title, sources, weights, hasBody: read !== undefined };
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
