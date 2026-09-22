import { describe, expect, it } from 'vitest';
import type { VaultDoc, VaultManifest } from '@/entities/docs-vault';
import { manifestToConceptFacts } from './use-vault-concept-facts';

function doc(partial: Partial<VaultDoc> & { slug: string }): VaultDoc {
  return {
    path: `${partial.slug}.md`,
    title: partial.slug,
    tags: [],
    frontmatter: {},
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt: '2026-07-26T00:00:00.000Z',
    linksOut: [],
    ...partial,
  };
}

function manifest(docs: VaultDoc[]): VaultManifest {
  return {
    version: '1',
    generatedAt: '2026-07-26T00:00:00.000Z',
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: 'root', path: '', type: 'dir', children: [] },
  };
}

describe('manifestToConceptFacts', () => {
  it('검사가 적어 둔 소견을 그대로 옮긴다 — 문서마다 코드 목록 그대로', () => {
    const facts = manifestToConceptFacts(
      manifest([
        doc({
          slug: 'capabilities/a',
          meaningFindings: ['definition-missing', 'boundary-missing'],
        }),
        doc({ slug: 'capabilities/b', meaningFindings: [] }),
      ]),
    );
    expect(facts.get('capabilities/a')?.findings).toEqual([
      'definition-missing',
      'boundary-missing',
    ]);
    expect(facts.get('capabilities/b')?.findings).toEqual([]);
  });

  it('본문 요약이 있어도 뜻 없음을 뒤집지 않는다 — 판정은 검사의 것', () => {
    // Before 2026-09-22 a single excerpt line read as "the meaning is written down",
    // so the one document `validate_vault` was reporting `definition-missing` on to the
    // agent was the one document this screen called clean.
    const facts = manifestToConceptFacts(
      manifest([
        doc({
          slug: 'capabilities/a',
          description: '한 줄 설명',
          excerpt: '주문을 받아 결제까지 잇는 기능.',
          meaningFindings: ['definition-missing'],
        }),
      ]),
    );
    expect(facts.get('capabilities/a')?.findings).toEqual(['definition-missing']);
  });

  it('소견 칸이 없는 문서는 빈 목록 — 없는 판정을 지어내지 않는다', () => {
    const facts = manifestToConceptFacts(
      manifest([doc({ slug: 'guide/getting-started' })]),
    );
    expect(facts.get('guide/getting-started')?.findings).toEqual([]);
  });

  it('빈 domain 문자열은 소속 미정으로 읽고, mtime 이 없으면 null', () => {
    const facts = manifestToConceptFacts(
      manifest([
        doc({ slug: 'capabilities/a', frontmatter: { domain: '  ' } }),
        doc({ slug: 'capabilities/b', frontmatter: { domain: 'billing' }, mtime: 99 }),
      ]),
    );
    expect(facts.get('capabilities/a')?.domainRef).toBeNull();
    expect(facts.get('capabilities/a')?.mtime).toBeNull();
    expect(facts.get('capabilities/b')?.domainRef).toBe('billing');
    expect(facts.get('capabilities/b')?.mtime).toBe(99);
  });
});
