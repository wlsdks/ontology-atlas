import { describe, expect, it } from 'vitest';

import type { VaultDoc, VaultSourceFile } from '@/entities/docs-vault';

import { runConsistencyPass } from './consistency-pass';

function source(path: string): VaultSourceFile {
  return { path, name: path.split('/').pop() as string, format: 'md', bytes: 100, mtime: 1_757_000_000_000 };
}

function wiki(slug: string, frontmatter: Record<string, unknown>): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title: slug.replace('wiki/', ''),
    tags: [],
    frontmatter,
    headings: [],
    excerpt: '',
    wordCount: 10,
    updatedAt: '2026-09-17T00:00:00Z',
    linksOut: [],
  };
}

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const FITTING_PAGE = [
  '---',
  'title: Plan',
  'created_by: agent:claude',
  'compiled_at: 2026-09-17T00:00:00Z',
  'sources:',
  '  - sources/plan.md',
  'source_hash:',
  `  sources/plan.md: ${HASH_A}`,
  'status: draft',
  'summary: The plan.',
  '---',
  '',
  '## Summary',
  '',
  'The plan [[src:sources/plan.md#p1]].',
  '',
  '## Facts',
  '',
  '- One fact [[src:sources/plan.md#p1]]',
  '',
  '## Decisions',
  '',
  '## Open questions',
  '',
  '## Not in sources',
  '',
].join('\n');

describe('consistency pass', () => {
  it('holds when every cited hash still matches', () => {
    const result = runConsistencyPass({
      sources: [source('sources/plan.md')],
      docs: [wiki('wiki/plan', { sources: ['sources/plan.md'], source_hash: { 'sources/plan.md': HASH_A } })],
      hashes: new Map([['sources/plan.md', HASH_A]]),
      pageTexts: new Map([['wiki/plan', FITTING_PAGE]]),
    });
    expect(result).toEqual({ checked: 1, stalePages: [], staleSources: [], offTemplate: [], notCompiled: 0 });
  });

  it('names the page and the source when the bytes changed under it', () => {
    const result = runConsistencyPass({
      sources: [source('sources/plan.md'), source('sources/budget.md')],
      docs: [
        wiki('wiki/plan', { sources: ['sources/plan.md'], source_hash: { 'sources/plan.md': HASH_A } }),
        wiki('wiki/budget', { sources: ['sources/budget.md'], source_hash: { 'sources/budget.md': HASH_A } }),
      ],
      hashes: new Map([['sources/plan.md', HASH_B], ['sources/budget.md', HASH_A]]),
      pageTexts: new Map(),
    });
    expect(result.stalePages).toEqual(['wiki/plan']);
    expect(result.staleSources).toEqual(['sources/plan.md']);
    expect(result.checked).toBe(2);
  });

  it('reports a page that no longer fits the contract, and counts sources nobody wrote up', () => {
    const result = runConsistencyPass({
      sources: [source('sources/plan.md'), source('sources/orphan.md')],
      docs: [wiki('wiki/plan', { sources: ['sources/plan.md'], source_hash: { 'sources/plan.md': HASH_A } })],
      hashes: new Map([['sources/plan.md', HASH_A]]),
      pageTexts: new Map([['wiki/plan', '---\ntitle: Plan\n---\n\nno sections']]),
    });
    expect(result.offTemplate).toEqual(['wiki/plan']);
    expect(result.notCompiled).toBe(1);
  });

  it('ignores furniture and retained answers when counting what it checked', () => {
    const result = runConsistencyPass({
      sources: [source('sources/plan.md')],
      docs: [
        wiki('wiki/plan', { sources: ['sources/plan.md'], source_hash: { 'sources/plan.md': HASH_A } }),
        wiki('wiki/_log', {}),
        wiki('wiki/answers/q-1', { sources: ['sources/plan.md'], source_hash: { 'sources/plan.md': HASH_B } }),
      ],
      hashes: new Map([['sources/plan.md', HASH_A]]),
      pageTexts: new Map(),
    });
    expect(result.checked).toBe(2);
    expect(result.stalePages).toEqual([]);
  });
});
