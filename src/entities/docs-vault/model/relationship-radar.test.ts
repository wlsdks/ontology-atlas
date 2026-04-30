import { describe, expect, it } from 'vitest';
import type { VaultDoc } from './types';
import { findRelationshipRadarSuggestions } from './relationship-radar';

function doc(overrides: Partial<VaultDoc> = {}): VaultDoc {
  return {
    slug: overrides.slug ?? 'doc',
    path: `docs/${overrides.slug ?? 'doc'}.md`,
    title: overrides.title ?? 'Doc',
    description: overrides.description,
    tags: overrides.tags ?? [],
    frontmatter: overrides.frontmatter ?? {},
    headings: [],
    excerpt: overrides.excerpt ?? '',
    wordCount: 0,
    updatedAt: '2026-04-24T00:00:00.000Z',
    mode: overrides.mode ?? 'both',
    linksOut: overrides.linksOut ?? [],
    ...overrides,
  };
}

describe('findRelationshipRadarSuggestions', () => {
  it('returns no suggestions without a selected document', () => {
    expect(findRelationshipRadarSuggestions([doc()], null)).toEqual([]);
  });

  it('prioritizes already linked documents', () => {
    const docs = [
      doc({ slug: 'a', linksOut: ['b'], tags: ['iam'] }),
      doc({ slug: 'b', tags: ['other'] }),
      doc({ slug: 'c', tags: ['iam'] }),
    ];

    const result = findRelationshipRadarSuggestions(docs, 'a');

    expect(result[0].doc.slug).toBe('b');
    expect(result[0].linked).toBe(true);
    expect(result[0].reasons).toContain('이미 연결됨');
  });

  it('scores shared tags and project refs', () => {
    const docs = [
      doc({
        slug: 'a',
        tags: ['billing', 'policy'],
        frontmatter: { projects: ['billing'] },
      }),
      doc({
        slug: 'b',
        tags: ['billing'],
        frontmatter: { project: 'billing' },
      }),
    ];

    const result = findRelationshipRadarSuggestions(docs, 'a');

    expect(result[0].doc.slug).toBe('b');
    expect(result[0].sharedTags).toEqual(['billing']);
    expect(result[0].reasons).toContain('같은 프로젝트');
  });

  it('respects dismissed slugs', () => {
    const docs = [
      doc({ slug: 'a', tags: ['ux'] }),
      doc({ slug: 'b', tags: ['ux'] }),
    ];

    const result = findRelationshipRadarSuggestions(docs, 'a', {
      dismissedSlugs: new Set(['b']),
    });

    expect(result).toEqual([]);
  });
});
