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
  it('strips the leading frontmatter block', () => {
    const raw = '---\ntitle: Foo\ntags: [a]\n---\n\n# Body\n\ntext';
    expect(stripFrontmatterBlock(raw)).toBe('# Body\n\ntext');
  });

  it('returns the source unchanged without frontmatter', () => {
    expect(stripFrontmatterBlock('# Just body')).toBe('# Just body');
  });

  it('leaves a --- divider in the middle of the body alone', () => {
    const raw = '# Body\n\n---\n\nmore';
    expect(stripFrontmatterBlock(raw)).toBe(raw);
  });
});

describe('buildBodyEntry', () => {
  it('keeps the stripped body as raw and its lowercase form as lower', () => {
    const entry = buildBodyEntry('---\ntitle: X\n---\nHello WORLD', 'k1');
    expect(entry.raw).toBe('Hello WORLD');
    expect(entry.lower).toBe('hello world');
    expect(entry.key).toBe('k1');
  });

  it('keeps raw and lower the same length so offsets line up', () => {
    const entry = buildBodyEntry('한국어 Body MIXED 텍스트', 'k');
    expect(entry.lower.length).toBe(entry.raw.length);
  });
});

describe('docBodyCacheKey', () => {
  it('keys a local doc change on slug plus mtime', () => {
    const a = docBodyCacheKey(doc('a', { mtime: 100 }));
    const b = docBodyCacheKey(doc('a', { mtime: 200 }));
    expect(a).not.toBe(b);
  });

  it('keys a static doc without mtime on slug plus updatedAt', () => {
    const a = docBodyCacheKey(doc('a', { updatedAt: '2026-01-01T00:00:00.000Z' }));
    const b = docBodyCacheKey(doc('a', { updatedAt: '2026-02-01T00:00:00.000Z' }));
    expect(a).not.toBe(b);
    expect(a).toContain('a');
  });
});
