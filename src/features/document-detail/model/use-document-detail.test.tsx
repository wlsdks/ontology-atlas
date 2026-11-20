import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { bundledSamples, type DocumentRef } from '@/entities/docs-vault';
import { LocalVaultContext, type LocalVaultValue } from '@/entities/vault-session/model/local-vault-context';
import { useAdoptDocumentText, useDocumentDetail, useDocumentDetails } from './use-document-detail';

const headingsChunk = vi.hoisted(() => ({ loads: 0 }));
vi.mock('@/entities/docs-vault/lib/bundled-vault/static-headings', async (original) => {
  const actual = await original<typeof import('@/entities/docs-vault/lib/bundled-vault/static-headings')>();
  return {
    ...actual,
    loadStaticVaultHeadings: (...args: Parameters<typeof actual.loadStaticVaultHeadings>) => {
      headingsChunk.loads += 1;
      return actual.loadStaticVaultHeadings(...args);
    },
  };
});

/** A file whose read resolves when the test says so, to observe what shows while it is pending. */
function heldFile(text: string) {
  let release: () => void = () => {};
  const getFile = vi.fn(
    () => new Promise<File>((resolve) => {
      release = () => resolve(new File([text], 'doc.md'));
    }),
  );
  return { handle: { getFile } as unknown as FileSystemFileHandle, getFile, release: () => release() };
}

function folder(files: Record<string, FileSystemFileHandle>) {
  return {
    status: 'loaded',
    isReloadingSameVault: false,
    handle: {} as FileSystemDirectoryHandle,
    fileHandles: new Map(Object.entries(files)),
  } as unknown as LocalVaultValue;
}

function withFolder(get: () => LocalVaultValue) {
  return function FolderProvider({ children }: { children: ReactNode }) {
    return <LocalVaultContext.Provider value={get()}>{children}</LocalVaultContext.Provider>;
  };
}

const docAt = (mtime: number): DocumentRef => ({ slug: 'a', path: 'a.md', mtime });

describe('useDocumentDetail', () => {
  it('is pending, never empty, until the file is read', async () => {
    const file = heldFile('# A\n\n## Part\n\nfour words of body');
    const vault = folder({ a: file.handle });
    const { result } = renderHook(() => useDocumentDetail(docAt(1)), { wrapper: withFolder(() => vault) });
    await waitFor(() => expect(file.getFile).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
    await act(async () => file.release());
    await waitFor(() => expect(result.current?.headings.map((heading) => heading.text)).toEqual(['A', 'Part']));
  });

  it('keeps the shown detail while a newer version of the same document is read', async () => {
    const first = heldFile('# Before');
    const vault = folder({ a: first.handle });
    const { result, rerender } = renderHook(({ doc }) => useDocumentDetail(doc), {
      initialProps: { doc: docAt(1) },
      wrapper: withFolder(() => vault),
    });
    await waitFor(() => expect(first.getFile).toHaveBeenCalled());
    await act(async () => first.release());
    await waitFor(() => expect(result.current?.headings[0]?.text).toBe('Before'));

    const saved = heldFile('# After');
    vault.fileHandles = new Map([['a', saved.handle]]);
    rerender({ doc: docAt(2) });
    await waitFor(() => expect(saved.getFile).toHaveBeenCalled());
    expect(result.current?.headings[0]?.text).toBe('Before');
    await act(async () => saved.release());
    await waitFor(() => expect(result.current?.headings[0]?.text).toBe('After'));
  });

  it('keeps a cache-served detail on screen through a rebuild after going A, B, A', async () => {
    const docA = docAt(1);
    const docB: DocumentRef = { slug: 'b', path: 'b.md', mtime: 1 };
    const fileA = heldFile('# Alpha');
    const fileB = heldFile('# Beta');
    const vault = folder({ a: fileA.handle, b: fileB.handle });
    const { result, rerender } = renderHook(({ doc }) => useDocumentDetail(doc), {
      initialProps: { doc: docA },
      wrapper: withFolder(() => vault),
    });
    await waitFor(() => expect(fileA.getFile).toHaveBeenCalled());
    await act(async () => fileA.release());
    await waitFor(() => expect(result.current?.headings[0]?.text).toBe('Alpha'));
    rerender({ doc: docB });
    await waitFor(() => expect(fileB.getFile).toHaveBeenCalled());
    await act(async () => fileB.release());
    await waitFor(() => expect(result.current?.headings[0]?.text).toBe('Beta'));
    rerender({ doc: docA });
    expect(result.current?.headings[0]?.text).toBe('Alpha');

    const rebuiltA = heldFile('# Alpha');
    vault.fileHandles = new Map([['a', rebuiltA.handle], ['b', fileB.handle]]);
    rerender({ doc: docA });
    expect(result.current?.headings[0]?.text).toBe('Alpha');
    await act(async () => rebuiltA.release());
    expect(result.current?.headings[0]?.text).toBe('Alpha');
  });

  it('keeps the detail while the folder picker is open over the loaded folder', async () => {
    const file = heldFile('# Kept');
    const vault = folder({ a: file.handle });
    const { result, rerender } = renderHook(() => useDocumentDetail(docAt(1)), { wrapper: withFolder(() => vault) });
    await waitFor(() => expect(file.getFile).toHaveBeenCalled());
    await act(async () => file.release());
    await waitFor(() => expect(result.current?.headings[0]?.text).toBe('Kept'));
    Object.assign(vault, { status: 'opening', manifest: { docs: [] } });
    rerender();
    expect(result.current?.headings[0]?.text).toBe('Kept');
  });

  it('forgets the shown detail once no document is shown, holding nothing of its folder', async () => {
    const first = heldFile('# First');
    const vault = folder({ a: first.handle });
    const { result, rerender } = renderHook(({ doc }) => useDocumentDetail(doc), {
      initialProps: { doc: docAt(1) as DocumentRef | null },
      wrapper: withFolder(() => vault),
    });
    await waitFor(() => expect(first.getFile).toHaveBeenCalled());
    await act(async () => first.release());
    await waitFor(() => expect(result.current?.headings[0]?.text).toBe('First'));

    rerender({ doc: null });
    vault.fileHandles = new Map([['a', heldFile('# Second').handle]]);
    rerender({ doc: docAt(2) });
    expect(result.current).toBeUndefined();
  });

  it('answers nothing from the earlier folder after a folder switch', async () => {
    const earlier = heldFile('# Earlier');
    let vault = folder({ a: earlier.handle });
    const { result, rerender } = renderHook(() => useDocumentDetail(docAt(1)), { wrapper: withFolder(() => vault) });
    await waitFor(() => expect(earlier.getFile).toHaveBeenCalled());
    await act(async () => earlier.release());
    await waitFor(() => expect(result.current?.headings[0]?.text).toBe('Earlier'));

    const next = heldFile('# Next');
    vault = folder({ a: next.handle });
    rerender();
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(next.getFile).toHaveBeenCalled());
    await act(async () => next.release());
    await waitFor(() => expect(result.current?.headings[0]?.text).toBe('Next'));
  });

  it('derives from text the open document adopted, reading no file', async () => {
    const file = heldFile('# Unused');
    const vault = folder({ a: file.handle });
    const { result } = renderHook(
      () => {
        const adopt = useAdoptDocumentText();
        return { adopt, detail: useDocumentDetail(docAt(1)) };
      },
      { wrapper: withFolder(() => vault) },
    );
    act(() => result.current.adopt(docAt(1), Promise.resolve('# Adopted')));
    await waitFor(() => expect(result.current.detail?.headings[0]?.text).toBe('Adopted'));
    expect(file.getFile).not.toHaveBeenCalled();
  });
});

describe('useDocumentDetails on a bundled sample', () => {
  it('serves the inline excerpt without fetching the headings chunk when no outline is shown', async () => {
    const sample = bundledSamples.peek('storefront');
    expect(sample, 'the shared setup loads both samples').not.toBeNull();
    const docs = sample!.manifest.docs.slice(0, 5);
    const loadsBefore = headingsChunk.loads;
    const { result } = renderHook(() => useDocumentDetails(docs, { headings: false }));
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current?.map((detail) => detail?.excerpt)).toEqual(docs.map((doc) => doc.excerpt));
    expect(headingsChunk.loads).toBe(loadsBefore);
  });
});
