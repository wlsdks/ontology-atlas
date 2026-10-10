import { describe, expect, it } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import {
  buildTagIndexForDocs,
  filterDocsByCollection,
  firstReadableSlug,
  isAuthorableOntologyDocument,
  followMovedSlugs,
  resolveDocsVaultSlugAlias,
  resolveDocsVaultCollection,
  resolveInitialDocsCollection,
  shouldDeferDocsVaultDefaultSelection,
  shouldShowSampleWelcomeNote,
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
  it('scopes Library Ontology by the schema kinds rather than paths or describes heuristics', () => {
    for (const kind of ['project', 'domain', 'capability', 'element', 'document']) {
      expect(isAuthorableOntologyDocument(doc(`outside/${kind}`, { kind }))).toBe(true);
    }
    expect(isAuthorableOntologyDocument(doc('wiki/typed-node', { kind: 'document' }))).toBe(true);

    expect(isAuthorableOntologyDocument(doc('docs/ontology/plain-note', {}))).toBe(false);
    expect(
      isAuthorableOntologyDocument(doc('notes/reference', { describes: ['capabilities/audit'] })),
    ).toBe(false);
    expect(isAuthorableOntologyDocument(doc('README', { kind: 'vault-readme' }))).toBe(false);
    expect(
      isAuthorableOntologyDocument(doc('architecture/profile', {
        architecture_schema: 'architecture-profile/v1',
      })),
    ).toBe(false);
  });

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

  it('opens a moved document from the slug it had before the move', () => {
    const aliases = { 'ANALYSIS-RECORDS': 'contracts/analysis-records' };
    expect(
      resolveDocsVaultSlugAlias('ANALYSIS-RECORDS', [doc('contracts/analysis-records')], aliases),
    ).toBe('contracts/analysis-records');
    expect(resolveDocsVaultSlugAlias('ANALYSIS-RECORDS', [doc('FEATURES')], aliases)).toBe('ANALYSIS-RECORDS');
  });

  it('carries saved pins and recents to the moved slug without repeating one', () => {
    expect(
      followMovedSlugs(['ANALYSIS-RECORDS', 'FEATURES', 'contracts/analysis-records'], {
        'ANALYSIS-RECORDS': 'contracts/analysis-records',
      }),
    ).toEqual(['contracts/analysis-records', 'FEATURES']);
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

  it('defers the first default until the persisted source and local manifest are ready', () => {
    expect(
      shouldDeferDocsVaultDefaultSelection({
        normalizedQuerySlug: 'capabilities/audit-sample',
        selectedSlug: 'capabilities/audit-sample',
        selectionReady: false,
      }),
    ).toBe(true);
    expect(
      shouldDeferDocsVaultDefaultSelection({
        normalizedQuerySlug: null,
        selectedSlug: null,
        selectionReady: false,
      }),
    ).toBe(true);
  });

  it('shows the sample welcome note only on a fresh, undismissed sample landing', () => {
    expect(
      shouldShowSampleWelcomeNote({
        source: 'server',
        normalizedQuerySlug: null,
        dismissed: false,
      }),
    ).toBe(true);
    // A shared `?slug=` link goes straight to its document.
    expect(
      shouldShowSampleWelcomeNote({
        source: 'server',
        normalizedQuerySlug: 'ARCHITECTURE',
        dismissed: false,
      }),
    ).toBe(false);
    expect(
      shouldShowSampleWelcomeNote({
        source: 'server',
        normalizedQuerySlug: null,
        dismissed: true,
      }),
    ).toBe(false);
    expect(
      shouldShowSampleWelcomeNote({
        source: 'local',
        normalizedQuerySlug: null,
        dismissed: false,
      }),
    ).toBe(false);
  });
});

/** The first screen must not show zero documents while the pill counts them. */
describe('resolveInitialDocsCollection never opens on an empty list', () => {
  it('opens the preferred collection when it has docs', () => {
    const docs = [doc('a'), doc('b', { kind: 'capability' })];
    expect(resolveInitialDocsCollection(docs)).toBe('guides');
  });

  it('opens all docs when the preferred collection is empty but others are not', () => {
    // The dogfood sample has this shape: every document is an ontology node.
    const docs = [doc('a', { kind: 'domain' }), doc('b', { kind: 'element' })];
    expect(resolveInitialDocsCollection(docs)).toBe('all');
  });

  it('keeps the preferred collection when the vault is empty', () => {
    expect(resolveInitialDocsCollection([])).toBe('guides');
  });

  it('accepts an explicit preferred collection', () => {
    const docs = [doc('a')];
    expect(resolveInitialDocsCollection(docs, 'ontology')).toBe('all');
  });
});

describe('firstReadableSlug', () => {
  it('skips an architecture profile and takes the next document', () => {
    const docs = [
      doc('profile', { architecture_schema: 'architecture-profile/v1' }),
      doc('readme'),
    ];
    expect(firstReadableSlug(docs)).toBe('readme');
  });

  it('gives undefined for an empty list or only profiles', () => {
    expect(firstReadableSlug([])).toBeUndefined();
    expect(
      firstReadableSlug([doc('profile', { architecture_schema: 'architecture-profile/v1' })]),
    ).toBeUndefined();
  });
});
