import { describe, expect, it } from 'vitest';
import type { VaultDoc } from '../model/types';
import { findRelatedDocs } from './related-docs';

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
    updatedAt: '2026-04-23T00:00:00.000Z',
    linksOut: overrides.linksOut ?? [],
    ...overrides,
  };
}

describe('findRelatedDocs', () => {
  it('filters out docs with no match', () => {
    const docs = [
      doc({ slug: 'a', title: '전혀 다른 문서' }),
      doc({ slug: 'b', title: '마찬가지' }),
    ];
    const result = findRelatedDocs(docs, { projectSlug: 'reactor' });
    expect(result).toEqual([]);
  });

  it('scores a frontmatter projects match highest', () => {
    const docs = [
      doc({ slug: 'a', frontmatter: { projects: ['reactor'] } }),
      doc({ slug: 'b', excerpt: 'reactor 를 한 번 언급' }),
    ];
    const result = findRelatedDocs(docs, {
      projectSlug: 'reactor',
      projectName: 'Reactor',
    });
    expect(result[0]?.doc.slug).toBe('a');
    expect(result[0]?.score).toBeGreaterThan(result[1]?.score ?? 0);
    expect(result[0]?.reasons).toContain('frontmatter.projects');
  });

  it('matches a wikilink', () => {
    const docs = [doc({ slug: 'a', linksOut: ['project:reactor'] })];
    const result = findRelatedDocs(docs, { projectSlug: 'reactor' });
    expect(result).toHaveLength(1);
    expect(result[0].reasons).toContain('wikilink');
  });

  it('counts a /project/{slug} mention in the body', () => {
    const docs = [
      doc({
        slug: 'a',
        excerpt: '자세한 건 /project/reactor 참고',
      }),
    ];
    const result = findRelatedDocs(docs, { projectSlug: 'reactor' });
    expect(result).toHaveLength(1);
    expect(result[0].reasons).toContain('project-url');
  });

  it('weights a project name in the title or excerpt', () => {
    const docs = [
      doc({
        slug: 'a',
        title: 'Demo Reactor 운영 가이드',
      }),
      doc({
        slug: 'b',
        excerpt: 'Demo Reactor 는 이러이러...',
      }),
    ];
    const result = findRelatedDocs(docs, {
      projectSlug: 'reactor',
      projectName: 'Demo Reactor',
    });
    // A title match outranks an excerpt match.
    expect(result[0].doc.slug).toBe('a');
    expect(result[0].reasons).toContain('title');
    expect(result[1].reasons).toContain('excerpt');
  });

  it('matches aliases when hub and container slugs differ', () => {
    const docs = [
      doc({ slug: 'a', frontmatter: { projects: ['arc'] } }),
    ];
    const result = findRelatedDocs(docs, {
      projectSlug: 'reactor',
      aliases: ['arc'],
    });
    expect(result).toHaveLength(1);
    expect(result[0].reasons).toContain('frontmatter.projects');
  });

  it('respects limit', () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      doc({ slug: `d${i}`, frontmatter: { projects: ['reactor'] } }),
    );
    const result = findRelatedDocs(
      docs,
      { projectSlug: 'reactor' },
      3,
    );
    expect(result).toHaveLength(3);
  });
});
