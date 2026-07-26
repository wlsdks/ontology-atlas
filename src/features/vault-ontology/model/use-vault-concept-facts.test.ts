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
  it('description 이 없어도 본문 요약이 있으면 뜻이 적혀 있는 것으로 본다', () => {
    const facts = manifestToConceptFacts(
      manifest([
        doc({ slug: 'capabilities/a', excerpt: '주문을 받아 결제까지 잇는 기능.' }),
        doc({ slug: 'capabilities/b' }),
      ]),
    );
    expect(facts.get('capabilities/a')?.hasDefinition).toBe(true);
    expect(facts.get('capabilities/b')?.hasDefinition).toBe(false);
  });

  it('frontmatter description 도 읽는다 — 두 표기 중 어느 쪽이든', () => {
    const facts = manifestToConceptFacts(
      manifest([
        doc({ slug: 'capabilities/top', description: '위 필드' }),
        doc({ slug: 'capabilities/fm', frontmatter: { description: '프론트매터' } }),
        doc({ slug: 'capabilities/blank', description: '   ' }),
      ]),
    );
    expect(facts.get('capabilities/top')?.hasDefinition).toBe(true);
    expect(facts.get('capabilities/fm')?.hasDefinition).toBe(true);
    expect(facts.get('capabilities/blank')?.hasDefinition).toBe(false);
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
