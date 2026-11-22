import { describe, expect, it } from 'vitest';

import type { VaultDoc } from '../../model/vault-manifest';
import { buildWikiRetrievalIndex, wikiRetrievalPage } from './wiki-retrieval';

function doc(slug: string, title = slug, frontmatter = {}): VaultDoc {
  return { slug, path: `${slug}.md`, title, frontmatter, tags: [], 
    updatedAt: '', linksOut: [] };
}

const read = (texts: ReadonlyMap<string, string>) =>
  new Map([...texts].map(([slug, raw]) => [slug, wikiRetrievalPage(raw)] as const));

describe('wiki retrieval from the Library read cache', () => {
  it('finds a body-only connection among distractors and puts exact source citations first', () => {
    const docs = [doc('wiki/answers/when', 'Saved answer'), doc('wiki/prior', 'Earlier plan', { sources: ['sources/new.md'] }),
      ...Array.from({ length: 35 }, (_, i) => doc(`wiki/other-${i}`, `Orchard ${i}`))];
    const texts = new Map(docs.map((d) => [d.slug, d.slug === 'wiki/answers/when'
      ? '---\nsource_hash: ignored\n---\n\nThe Zephyr release ships in September after review.'
      : d.slug === 'wiki/prior' ? '---\nsources: [sources/new.md]\n---\nEarlier plan.' : 'Apples grow in the orchard.']));
    const result = buildWikiRetrievalIndex(docs, read(texts)).search('sources/new.md', 'Zephyr release review approved for September 22.');
    expect(result.candidates.map((c) => c.slug)).toEqual(['wiki/prior', 'wiki/answers/when']);
    expect(result.candidates[0].sameSource).toBe(true);
    expect(result.candidates[1].matchedTerms).toContain('zephyr');
    expect(result).toMatchObject({ searchedPages: 37, fullTextPages: 37, omittedMatches: 0 });
  });

  it('matches Korean terms across particles without treating dates and boilerplate as a topic', () => {
    const docs = [doc('wiki/retention', '보관 기준'), doc('wiki/other', '무관한 기록')];
    const texts = new Map([
      ['wiki/retention', '감사로그를 30일 보관한다.'],
      ['wiki/other', '---\ncompiled_at: 2026-09-10\n---\n## Summary\n\n## Facts\n\n9월 10일 과수원 수확.'],
    ]);
    expect(buildWikiRetrievalIndex(docs, read(texts)).search('sources/new.md', '감사로그의 보관기간은 90일이다.').candidates[0]?.slug).toBe('wiki/retention');
    expect(buildWikiRetrievalIndex(docs, read(texts)).search('sources/unknown.md', '## Summary\n\n2026-09-10').candidates).toEqual([]);
  });

  it('excludes ontology, furniture and unsafe slugs, reports cache coverage and bounds results', () => {
    const docs = [doc('wiki/_index'), doc('wiki/_private/zephyr'), doc('wiki/zephyr#anchor'), doc('wiki/../escape'), doc('wiki/node', 'Zephyr', { kind: 'capability' }),
      doc('capabilities/zephyr'), ...Array.from({ length: 7 }, (_, i) => doc(`wiki/zephyr-${i}`, 'Zephyr'))];
    const index = buildWikiRetrievalIndex(docs, read(new Map([['wiki/zephyr-0', 'Zephyr']])));
    const result = index.search('sources/zephyr.md', 'Zephyr');
    expect(result).toMatchObject({ searchedPages: 7, fullTextPages: 1, limit: 3, omittedMatches: 4 });
    expect(result.candidates.map((c) => c.slug)).toEqual(['wiki/zephyr-0', 'wiki/zephyr-1', 'wiki/zephyr-2']);
    expect(index.search('sources/unknown.md', 'quasar').candidates).toEqual([]);
  });

  it('strips citation paths and frontmatter hashes from lexical matching', () => {
    const index = buildWikiRetrievalIndex([doc('wiki/unrelated', 'Apples')], read(new Map([
      ['wiki/unrelated', '---\nsource_hash:\n  sources/plan.md: zephyr\n---\nFruit [[src:sources/zephyr.md#p2]]'],
    ])));
    expect(index.search('sources/new.md', 'Zephyr').candidates).toEqual([]);
  });

  it('falls back to the description for a page whose text is not cached', () => {
    const page = { ...doc('wiki/zephyr-notes', 'Notes'), description: 'Zephyr release schedule' };
    const result = buildWikiRetrievalIndex([page]).search('sources/new.md', 'Zephyr release');
    expect(result.candidates.map((c) => c.slug)).toEqual(['wiki/zephyr-notes']);
    expect(result).toMatchObject({ searchedPages: 1, fullTextPages: 0 });
  });
});
