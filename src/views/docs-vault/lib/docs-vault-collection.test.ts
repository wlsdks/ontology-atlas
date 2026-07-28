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
    // 명시적 딥링크(?slug=)로 들어오면 노트를 건너뛴다 — 공유 링크는
    // 그 문서로 바로 가야 한다.
    expect(
      shouldShowSampleWelcomeNote({
        source: 'server',
        normalizedQuerySlug: 'ARCHITECTURE',
        dismissed: false,
      }),
    ).toBe(false);
    // 사용자가 실제 문서를 골랐으면(dismissed) 다시 밀어붙이지 않는다.
    expect(
      shouldShowSampleWelcomeNote({
        source: 'server',
        normalizedQuerySlug: null,
        dismissed: true,
      }),
    ).toBe(false);
    // 로컬(사용자 자신의) vault 에는 애초에 해당 없음.
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
 * 첫 화면이 **자기가 가진 것을 보여준다** (2026-07-28 실측 결함).
 *
 * 기본 컬렉션이 `'guides'` 로 못 박혀 있어서, 그 컬렉션이 0건인 볼트를 열면
 * 볼트 필은 "문서 31개" 라고 말하는데 목록은 비어 있었다. 폴백이 없었고
 * (`setDocCollection` 호출은 전부 사용자 액션 경유), 처음 온 사람이 보는
 * 화면이 31개 중 0개였다.
 *
 * 복잡도 이전에 **정직성** 문제다 — 화면이 자기 상태에 대해 거짓을 말한다.
 * 그래서 판정은 "무엇이 예쁜가" 가 아니라 "센 것과 보인 것이 같은가" 다.
 */
describe('resolveInitialDocsCollection — 첫 화면은 빈 목록으로 열리지 않는다', () => {
  it('선호 컬렉션에 문서가 있으면 그대로 연다', () => {
    const docs = [doc('a'), doc('b', { kind: 'capability' })];
    expect(resolveInitialDocsCollection(docs)).toBe('guides');
  });

  it('선호 컬렉션이 0건이고 다른 곳에 문서가 있으면 전체로 연다', () => {
    // 이 저장소의 dogfood 샘플이 정확히 이 모양이다 — 전부 온톨로지 노드라
    // guides 가 0.
    const docs = [doc('a', { kind: 'domain' }), doc('b', { kind: 'element' })];
    expect(resolveInitialDocsCollection(docs)).toBe('all');
  });

  // 빈 볼트에서 'all' 로 바꿔 봐야 여전히 0건이다. 아무 말도 안 하는 폴백은
  // 상태만 흔들고 사용자에게 주는 것이 없으므로 선호값을 지킨다.
  it('볼트가 비어 있으면 선호 컬렉션을 지킨다', () => {
    expect(resolveInitialDocsCollection([])).toBe('guides');
  });

  it('선호 컬렉션을 지정할 수 있다', () => {
    const docs = [doc('a')];
    expect(resolveInitialDocsCollection(docs, 'ontology')).toBe('all');
  });
});
