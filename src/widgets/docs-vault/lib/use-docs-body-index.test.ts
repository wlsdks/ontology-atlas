import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { VaultDoc } from '@/entities/docs-vault';
import { RETAINED_BODY_CHARS, useDocsBodyIndex } from './use-docs-body-index';

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

async function visit(docs: VaultDoc[], scope: string, getDocContent: (slug: string) => Promise<string>) {
  const view = renderHook(() => useDocsBodyIndex({ docs, enabled: true, scope, getDocContent, startDelayMs: 0 }));
  await waitFor(() => expect(view.result.current.indexing).toBe(false));
  await waitFor(() => expect(view.result.current.bodyIndex.size).toBeGreaterThan(0));
  return view;
}

describe('useDocsBodyIndex', () => {
  it('reads every doc body through the resolver into a lowercase index', async () => {
    const reads: string[] = [];
    const getDocContent = vi.fn(async (slug: string) => {
      reads.push(slug);
      return `---\ntitle: ${slug}\n---\nBody of ${slug.toUpperCase()}`;
    });
    const { result } = await visit([doc('a', 1), doc('b', 1)], 'sample:reads', getDocContent);
    expect(result.current.bodyIndex.size).toBe(2);
    expect(result.current.bodyIndex.get('a')?.lower).toContain('body of a');
    // Frontmatter is excluded from the index.
    expect(result.current.bodyIndex.get('a')?.lower).not.toContain('title:');
    expect(reads.sort()).toEqual(['a', 'b']);
  });

  it('reads nothing until the palette first opens', async () => {
    const getDocContent = vi.fn(async (slug: string) => `body ${slug}`);
    const docs = [doc('a', 1)];
    const { result, rerender } = renderHook(
      ({ enabled }) => useDocsBodyIndex({ docs, enabled, scope: 'sample:closed', getDocContent, startDelayMs: 0 }),
      { initialProps: { enabled: false } },
    );
    await waitFor(() => expect(result.current.indexing).toBe(false));
    expect(getDocContent).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.bodyIndex.get('a')?.raw).toBe('body a'));
    expect(getDocContent).toHaveBeenCalledOnce();
  });

  it('does not reread a doc whose mtime is unchanged', async () => {
    const getDocContent = vi.fn(async (slug: string) => `body ${slug}`);
    const docsV1 = [doc('a', 1), doc('b', 1)];
    const { result, rerender } = renderHook(
      ({ docs }) => useDocsBodyIndex({ docs, enabled: true, scope: 'sample:mtime', getDocContent, startDelayMs: 0 }),
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

  it('skips docs that fail to read and indexes the rest', async () => {
    const getDocContent = vi.fn(async (slug: string) => {
      if (slug === 'bad') throw new Error('io');
      return `body ${slug}`;
    });
    const { result } = await visit([doc('bad', 1), doc('ok', 1)], 'sample:failed', getDocContent);
    expect(result.current.bodyIndex.get('ok')?.raw).toBe('body ok');
    expect(result.current.bodyIndex.has('bad')).toBe(false);
  });

  it('reads no body again on a second visit to the same vault session', async () => {
    const docs = [doc('a', 1), doc('b', 1)];
    const first = await visit(docs, 'local:vault#1', async (slug) => `body ${slug}`);
    first.unmount();
    const reread = vi.fn(async (slug: string) => `body ${slug}`);
    const second = await visit(docs, 'local:vault#1', reread);
    expect(reread).not.toHaveBeenCalled();
    expect(second.result.current.bodyIndex.get('b')?.raw).toBe('body b');

    const otherSession = vi.fn(async (slug: string) => `other ${slug}`);
    const third = await visit(docs, 'local:vault#2', otherSession);
    expect(otherSession).toHaveBeenCalledTimes(2);
    expect(third.result.current.bodyIndex.get('a')?.raw).toBe('other a');
  });

  it('keeps no more than the retained cap, so the least recently read body is read again', async () => {
    const rawAndLowerAreHalfTheCap = 'x'.repeat(RETAINED_BODY_CHARS / 4);
    const docs = [doc('first', 1), doc('second', 1), doc('third', 1)];
    const first = await visit(docs, 'local:large#1', async () => rawAndLowerAreHalfTheCap);
    first.unmount();
    const reread = vi.fn(async (_slug: string) => rawAndLowerAreHalfTheCap);
    await visit(docs, 'local:large#1', reread);
    expect(reread.mock.calls.map(([slug]) => slug)).toEqual(['first']);
  });
});
