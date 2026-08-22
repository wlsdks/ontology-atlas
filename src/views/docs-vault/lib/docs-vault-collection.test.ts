import { describe, expect, it } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import {
  buildTagIndexForDocs,
  filterDocsByCollection,
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
    // Arriving with an explicit deeplink (?slug=) skips the note — a shared link must go straight
    // to that document.
    expect(
      shouldShowSampleWelcomeNote({
        source: 'server',
        normalizedQuerySlug: 'ARCHITECTURE',
        dismissed: false,
      }),
    ).toBe(false);
    // Once the user has selected a real document (dismissed), it is not pushed again.
    expect(
      shouldShowSampleWelcomeNote({
        source: 'server',
        normalizedQuerySlug: null,
        dismissed: true,
      }),
    ).toBe(false);
    // Not applicable at all to a local (the user's own) vault.
    expect(
      shouldShowSampleWelcomeNote({
        source: 'local',
        normalizedQuerySlug: null,
        dismissed: false,
      }),
    ).toBe(false);
  });
});

/**
 * The first screen **shows what it actually has** (measured defect, 2026-07-28).
 *
 * The default collection was pinned to `'guides'`, so opening a vault where that collection is
 * empty left the vault pill saying "31 documents" while the list was empty. There was no fallback
 * (every `setDocCollection` call goes through a user action), and a first-time visitor saw 0 of 31.
 *
 * This is a question of **honesty** before complexity — the screen was lying about its own state.
 * So the verdict is not "what looks nicer" but "does what was counted match what was shown".
 */
describe('resolveInitialDocsCollection — 첫 화면은 빈 목록으로 열리지 않는다', () => {
  it('선호 컬렉션에 문서가 있으면 그대로 연다', () => {
    const docs = [doc('a'), doc('b', { kind: 'capability' })];
    expect(resolveInitialDocsCollection(docs)).toBe('guides');
  });

  it('선호 컬렉션이 0건이고 다른 곳에 문서가 있으면 전체로 연다', () => {
    // This repository's dogfood sample has exactly this shape — everything is an ontology node, so
    // guides is zero.
    const docs = [doc('a', { kind: 'domain' }), doc('b', { kind: 'element' })];
    expect(resolveInitialDocsCollection(docs)).toBe('all');
  });

  // Switching to 'all' in an empty vault still gives zero. A fallback that says nothing only churns
  // state and gives the user nothing, so the preference is kept.
  it('볼트가 비어 있으면 선호 컬렉션을 지킨다', () => {
    expect(resolveInitialDocsCollection([])).toBe('guides');
  });

  it('선호 컬렉션을 지정할 수 있다', () => {
    const docs = [doc('a')];
    expect(resolveInitialDocsCollection(docs, 'ontology')).toBe('all');
  });
});
