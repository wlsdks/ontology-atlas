import { describe, expect, it } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import {
  buildTagIndexForDocs,
  filterDocsByCollection,
  resolveDocsVaultSlugAlias,
  resolveDocsVaultCollection,
  shouldDeferDocsVaultDefaultSelection,
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

  it('treats research documents that describe ontology nodes as ontology notes', () => {
    expect(
      resolveDocsVaultCollection(
        doc('documents/agent-practice-research', {
          kind: 'document',
          describes: ['capabilities/agent-practitioner-concerns-map'],
        }),
      ),
    ).toBe('ontology');
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

  it('resolves packaged ontology doc slugs against a local ontology vault', () => {
    expect(
      resolveDocsVaultSlugAlias('ontology/documents/agent-practice-research', [
        doc('documents/agent-practice-research'),
      ]),
    ).toBe('documents/agent-practice-research');
  });

  it('resolves local ontology doc slugs against the packaged docs vault', () => {
    expect(
      resolveDocsVaultSlugAlias('documents/agent-practice-research', [
        doc('ontology/documents/agent-practice-research'),
      ]),
    ).toBe('ontology/documents/agent-practice-research');
  });

  it('defers default selection while a query slug alias is being applied', () => {
    expect(
      shouldDeferDocsVaultDefaultSelection({
        normalizedQuerySlug: 'documents/agent-practice-research',
        selectedSlug: 'ontology/documents/agent-practice-research',
      }),
    ).toBe(true);
    expect(
      shouldDeferDocsVaultDefaultSelection({
        normalizedQuerySlug: 'documents/agent-practice-research',
        selectedSlug: 'documents/agent-practice-research',
      }),
    ).toBe(false);
    expect(
      shouldDeferDocsVaultDefaultSelection({
        normalizedQuerySlug: null,
        selectedSlug: null,
      }),
    ).toBe(false);
  });
});
