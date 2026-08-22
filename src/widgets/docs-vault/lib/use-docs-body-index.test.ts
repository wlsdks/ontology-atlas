import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { VaultDoc } from '@/entities/docs-vault';
import { useDocsBodyIndex } from './use-docs-body-index';

function doc(slug: string, mtime: number): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title: slug,
    tags: [],
    frontmatter: {},
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt: new Date(mtime).toISOString(),
    linksOut: [],
    mtime,
  };
}

describe('useDocsBodyIndex', () => {
  it('resolver 로 전 문서 본문을 읽어 소문자 정규화 인덱스를 만든다', async () => {
    const reads: string[] = [];
    const getDocContent = vi.fn(async (slug: string) => {
      reads.push(slug);
      return `---\ntitle: ${slug}\n---\nBody of ${slug.toUpperCase()}`;
    });
    const docs = [doc('a', 1), doc('b', 1)];
    const { result } = renderHook(() =>
      useDocsBodyIndex({ docs, getDocContent, startDelayMs: 0 }),
    );
    await waitFor(() => expect(result.current.indexing).toBe(false));
    expect(result.current.bodyIndex.size).toBe(2);
    expect(result.current.bodyIndex.get('a')?.lower).toContain('body of a');
    // Frontmatter is excluded from the index.
    expect(result.current.bodyIndex.get('a')?.lower).not.toContain('title:');
    expect(reads.sort()).toEqual(['a', 'b']);
  });

  it('mtime 이 같은 문서는 재독하지 않는다 (diff 갱신)', async () => {
    const getDocContent = vi.fn(async (slug: string) => `body ${slug}`);
    const docsV1 = [doc('a', 1), doc('b', 1)];
    const { result, rerender } = renderHook(
      ({ docs }) => useDocsBodyIndex({ docs, getDocContent, startDelayMs: 0 }),
      { initialProps: { docs: docsV1 } },
    );
    await waitFor(() => expect(result.current.bodyIndex.size).toBe(2));
    expect(getDocContent).toHaveBeenCalledTimes(2);

    // Only b's mtime changed — a reuses the cache and only b is re-read.
    rerender({ docs: [doc('a', 1), doc('b', 2)] });
    await waitFor(() => expect(getDocContent).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.indexing).toBe(false));
    expect(getDocContent.mock.calls[2][0]).toBe('b');
  });

  it('읽기 실패 문서는 건너뛰고 나머지는 인덱스된다', async () => {
    const getDocContent = vi.fn(async (slug: string) => {
      if (slug === 'bad') throw new Error('io');
      return `body ${slug}`;
    });
    const docs = [doc('bad', 1), doc('ok', 1)];
    const { result } = renderHook(() =>
      useDocsBodyIndex({ docs, getDocContent, startDelayMs: 0 }),
    );
    await waitFor(() => expect(result.current.indexing).toBe(false));
    expect(result.current.bodyIndex.get('ok')?.raw).toBe('body ok');
    expect(result.current.bodyIndex.has('bad')).toBe(false);
  });
});
