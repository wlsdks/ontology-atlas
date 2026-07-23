import { describe, expect, it } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import {
  buildBodyEntry,
  docBodyCacheKey,
  stripFrontmatterBlock,
} from './body-index';

function doc(slug: string, extra: Partial<VaultDoc> = {}): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title: slug,
    tags: [],
    frontmatter: {},
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linksOut: [],
    ...extra,
  };
}

describe('stripFrontmatterBlock', () => {
  it('선두 frontmatter 블록을 제거한다', () => {
    const raw = '---\ntitle: Foo\ntags: [a]\n---\n\n# Body\n\ntext';
    expect(stripFrontmatterBlock(raw)).toBe('# Body\n\ntext');
  });

  it('frontmatter 가 없으면 원문 그대로', () => {
    expect(stripFrontmatterBlock('# Just body')).toBe('# Just body');
  });

  it('본문 중간의 --- 구분선은 건드리지 않는다', () => {
    const raw = '# Body\n\n---\n\nmore';
    expect(stripFrontmatterBlock(raw)).toBe(raw);
  });
});

describe('buildBodyEntry', () => {
  it('frontmatter 를 벗겨 raw 로, 소문자 정규화를 lower 로 든다', () => {
    const entry = buildBodyEntry('---\ntitle: X\n---\nHello WORLD', 'k1');
    expect(entry.raw).toBe('Hello WORLD');
    expect(entry.lower).toBe('hello world');
    expect(entry.key).toBe('k1');
  });

  it('raw 와 lower 의 길이가 같다 (인덱스 offset 호환)', () => {
    const entry = buildBodyEntry('한국어 Body MIXED 텍스트', 'k');
    expect(entry.lower.length).toBe(entry.raw.length);
  });
});

describe('docBodyCacheKey', () => {
  it('로컬 문서는 slug+mtime 으로 변경 감지', () => {
    const a = docBodyCacheKey(doc('a', { mtime: 100 }));
    const b = docBodyCacheKey(doc('a', { mtime: 200 }));
    expect(a).not.toBe(b);
  });

  it('static 문서(mtime 없음)는 slug+updatedAt', () => {
    const a = docBodyCacheKey(doc('a', { updatedAt: '2026-01-01T00:00:00.000Z' }));
    const b = docBodyCacheKey(doc('a', { updatedAt: '2026-02-01T00:00:00.000Z' }));
    expect(a).not.toBe(b);
    expect(a).toContain('a');
  });
});
