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
  it('copies the finding codes the check recorded for each document', () => {
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

  it('keeps the missing-meaning finding even when the body has a summary', () => {
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

  it('returns an empty list for a document without findings', () => {
    const facts = manifestToConceptFacts(
      manifest([doc({ slug: 'guide/getting-started' })]),
    );
    expect(facts.get('guide/getting-started')?.findings).toEqual([]);
  });

  it('reads an empty domain string as unassigned and a missing mtime as null', () => {
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
