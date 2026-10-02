import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
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

  it('limits simultaneous reads and continues in document order after completion or failure', async () => {
    const docs = Array.from({ length: 10 }, (_, i) => doc(`문서/${i}`, 1));
    const pending = new Map<string, { resolve: (raw: string) => void; reject: (error: Error) => void }>();
    const getDocContent = vi.fn((slug: string) => new Promise<string>((resolve, reject) => {
      pending.set(slug, { resolve, reject });
    }));
    const { result } = renderHook(() => useDocsBodyIndex({
      docs, enabled: true, scope: 'sample:concurrency', getDocContent, startDelayMs: 0,
    }));
    const readSlugs = () => getDocContent.mock.calls.map(([slug]) => slug);
    await waitFor(() => expect(readSlugs()).toEqual(docs.slice(0, 6).map(d => d.slug)));
    await act(async () => { pending.get('문서/4')!.resolve('four'); pending.delete('문서/4'); });
    await waitFor(() => expect(readSlugs()).toEqual(docs.slice(0, 7).map(d => d.slug)));
    await act(async () => { pending.get('문서/1')!.reject(new Error('io')); pending.delete('문서/1'); });
    await waitFor(() => expect(readSlugs()).toEqual(docs.slice(0, 8).map(d => d.slug)));
    const releasePending = async () => act(async () => {
      const batch = [...pending];
      pending.clear();
      for (const [slug, read] of batch) read.resolve(`body ${slug}`);
    });
    await releasePending();
    await waitFor(() => expect(readSlugs()).toEqual(docs.map(d => d.slug)));
    await releasePending();
    await waitFor(() => expect(result.current.indexing).toBe(false));
    expect([...result.current.bodyIndex.keys()]).toEqual(docs.filter(d => d.slug !== '문서/1').map(d => d.slug));
    expect(result.current.bodyIndex.get('문서/4')?.raw).toBe('four');
  });

  it('abandons pending reads on unmount and reads those bodies on the next visit', async () => {
    const docs = Array.from({ length: 12 }, (_, i) => doc(`cancel/${i}`, 1));
    const pending: (() => void)[] = [];
    const getDocContent = vi.fn(() => new Promise<string>(resolve => {
      pending.push(() => resolve('abandoned body'));
    }));
    const first = renderHook(() => useDocsBodyIndex({
      docs, enabled: true, scope: 'sample:cancel', getDocContent, startDelayMs: 0,
    }));
    await waitFor(() => expect(getDocContent).toHaveBeenCalledTimes(6));
    first.unmount();
    await act(async () => { pending.forEach(resolve => resolve()); });
    expect(getDocContent).toHaveBeenCalledTimes(6);
    const reread = vi.fn(async (slug: string) => `fresh ${slug}`);
    const second = await visit(docs, 'sample:cancel', reread);
    expect(reread.mock.calls.map(([slug]) => slug)).toEqual(docs.map(d => d.slug));
    expect(second.result.current.bodyIndex.get('cancel/0')?.raw).toBe('fresh cancel/0');
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
