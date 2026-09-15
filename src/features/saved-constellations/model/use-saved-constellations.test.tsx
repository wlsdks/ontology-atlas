import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyLibraryCollections, type LibraryCollectionsSnapshot } from '@/entities/library-collection';
import { useSavedConstellations } from './use-saved-constellations';

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('@/entities/library-collection', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/entities/library-collection')>();
  return { ...original, loadLibraryCollections: mocks.load, saveLibraryCollections: mocks.save };
});

const handle = (name: string) => ({ kind: 'directory', name }) as FileSystemDirectoryHandle;
const snapshot = (): LibraryCollectionsSnapshot => ({
  parsed: { status: 'ready', value: emptyLibraryCollections() },
  expectedContent: null,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useSavedConstellations vault scope', () => {
  beforeEach(() => { mocks.load.mockReset(); mocks.save.mockReset(); });

  it('ignores an older same-name vault load after a newer handle settles', async () => {
    const first = deferred<LibraryCollectionsSnapshot>();
    const second = snapshot();
    mocks.load.mockReturnValueOnce(first.promise).mockResolvedValueOnce(second);
    const firstHandle = handle('same-name');
    const secondHandle = handle('same-name');
    const { result, rerender } = renderHook(({ current }) => useSavedConstellations(current), {
      initialProps: { current: firstHandle as FileSystemDirectoryHandle | null },
    });
    rerender({ current: secondHandle });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    first.resolve({ parsed: { status: 'corrupt', raw: '{bad', reason: 'old vault' }, expectedContent: '{bad' });
    await act(async () => { await first.promise; });
    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
  });

  it('does not apply a failed save from the previous vault after switching', async () => {
    const save = deferred<LibraryCollectionsSnapshot>();
    mocks.load.mockResolvedValue(snapshot());
    mocks.save.mockReturnValueOnce(save.promise);
    const firstHandle = handle('first');
    const secondHandle = handle('second');
    const { result, rerender } = renderHook(({ current }) => useSavedConstellations(current), {
      initialProps: { current: firstHandle as FileSystemDirectoryHandle | null },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let pending!: Promise<string>;
    act(() => {
      pending = result.current.saveConstellation({
        name: 'Review', purpose: '', members: [{ uid: '11111111-1111-4111-8111-111111111111', lastKnownPath: 'capabilities/review', label: 'Review' }],
      });
    });
    rerender({ current: secondHandle });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    save.reject(new Error('old save failed'));
    await act(async () => { await pending.catch(() => undefined); });
    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
  });
});
