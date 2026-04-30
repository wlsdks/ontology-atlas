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
    mode: overrides.mode ?? 'both',
    linksOut: overrides.linksOut ?? [],
    ...overrides,
  };
}

describe('findRelatedDocs', () => {
  it('매칭 없는 문서는 걸러낸다', () => {
    const docs = [
      doc({ slug: 'a', title: '전혀 다른 문서' }),
      doc({ slug: 'b', title: '마찬가지' }),
    ];
    const result = findRelatedDocs(docs, { projectSlug: 'reactor' });
    expect(result).toEqual([]);
  });

  it('frontmatter projects 배열 매치는 최고 점수', () => {
    const docs = [
      doc({ slug: 'a', frontmatter: { projects: ['reactor'] } }),
      doc({ slug: 'b', excerpt: 'reactor 를 한 번 언급', mode: 'both' }),
    ];
    const result = findRelatedDocs(docs, {
      projectSlug: 'reactor',
      projectName: 'Reactor',
    });
    expect(result[0]?.doc.slug).toBe('a');
    expect(result[0]?.score).toBeGreaterThan(result[1]?.score ?? 0);
    expect(result[0]?.reasons).toContain('frontmatter.projects');
  });

  it('wikilink 도 잡는다', () => {
    const docs = [doc({ slug: 'a', linksOut: ['project:reactor'] })];
    const result = findRelatedDocs(docs, { projectSlug: 'reactor' });
    expect(result).toHaveLength(1);
    expect(result[0].reasons).toContain('wikilink');
  });

  it('본문 /project/{slug} 언급도 신호', () => {
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

  it('제목/excerpt 에 projectName 포함 시 가중치', () => {
    const docs = [
      doc({
        slug: 'a',
        title: 'Arc Reactor 운영 가이드',
      }),
      doc({
        slug: 'b',
        excerpt: 'Arc Reactor 는 이러이러...',
      }),
    ];
    const result = findRelatedDocs(docs, {
      projectSlug: 'reactor',
      projectName: 'Arc Reactor',
    });
    // 제목 매치가 excerpt 보다 높음
    expect(result[0].doc.slug).toBe('a');
    expect(result[0].reasons).toContain('title');
    expect(result[1].reasons).toContain('excerpt');
  });

  it('aliases — hub 와 컨테이너 slug 가 다를 때', () => {
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

  it('limit 을 존중', () => {
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
