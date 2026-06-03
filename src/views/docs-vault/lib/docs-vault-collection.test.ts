import { describe, expect, it } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import {
  buildTagIndexForDocs,
  filterDocsByCollection,
  resolveDocsVaultCollection,
} from './docs-vault-collection';

function doc(
  slug: string,
  frontmatter: Record<string, unknown> = {},
  tags: string[] = [],
): VaultDoc {
  return {
    slug,
    path: `docs/${slug}.md`,
    title: slug,
    tags,
    frontmatter,
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linksOut: [],
  };
}

describe('docs vault collections', () => {
  it('treats ontology kind docs as ontology nodes', () => {
    expect(resolveDocsVaultCollection(doc('foo', { kind: 'capability' }))).toBe('ontology');
  });

  it('keeps ordinary product docs in guides', () => {
    expect(resolveDocsVaultCollection(doc('FEATURES', { kind: 'document' }))).toBe('guides');
  });

  it('filters docs and rebuilds tag counts for the active collection', () => {
    const docs = [
      doc('FEATURES', {}, ['guide', 'shared']),
      doc('ontology/domains/ui', { kind: 'domain' }, ['ontology', 'shared']),
    ];

    const guides = filterDocsByCollection(docs, 'guides');
    expect(guides.map((entry) => entry.slug)).toEqual(['FEATURES']);
    expect(buildTagIndexForDocs(guides)).toEqual({
      guide: ['FEATURES'],
      shared: ['FEATURES'],
    });
  });
});
