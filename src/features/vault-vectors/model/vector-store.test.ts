import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OFF_VECTOR_STATUS, prepareVectors, vectorStatus } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { vaultVectorSource } from '@/shared/lib/vault-folder/vault-vector-source';
import { prepare, resume, useVectorStatus } from './vector-store';

vi.mock('@/shared/lib/vault-folder/tauri-vault-vectors', async (original) => ({
  ...(await original<typeof import('@/shared/lib/vault-folder/tauri-vault-vectors')>()),
  prepareVectors: vi.fn(),
  vectorStatus: vi.fn(),
  subscribeVectorStatus: () => () => undefined,
}));

const ready = { ...OFF_VECTOR_STATUS, phase: 'ready' as const, filesDone: 4, filesTotal: 4 };
let root = 0;
let rootPath = '';

beforeEach(() => {
  rootPath = `/vault-${(root += 1)}`;
  vi.mocked(prepareVectors).mockReset();
  vi.mocked(vectorStatus).mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('the stored search-by-meaning choice', () => {
  it('is stored only once the app accepts the prepare', async () => {
    vi.mocked(prepareVectors).mockResolvedValueOnce(ready);
    await expect(prepare(rootPath, { kind: 'builtin' }, true)).resolves.toBe(true);
    expect(prepareVectors).toHaveBeenCalledWith(rootPath, { kind: 'builtin' }, true);
    expect(vaultVectorSource.read(rootPath)).toEqual({ source: { kind: 'builtin' }, paused: false });
  });

  it('is forgotten when the app refuses the prepare, and the folder reads as not set up', async () => {
    vi.mocked(prepareVectors).mockRejectedValueOnce('vault-not-chosen');
    const { result } = renderHook(() => useVectorStatus(rootPath));
    await act(async () => {
      await expect(prepare(rootPath, { kind: 'builtin' })).resolves.toBe(false);
    });
    expect(vaultVectorSource.read(rootPath)).toBeNull();
    expect(result.current?.phase).toBe('notSetUp');
  });

  it('is forgotten when the app refuses the status it was sent with', async () => {
    vaultVectorSource.write(rootPath, { kind: 'builtin' });
    vi.mocked(vectorStatus).mockRejectedValueOnce('embed-not-local');
    const { result } = renderHook(() => useVectorStatus(rootPath));
    await act(async () => {
      await vi.waitFor(() => expect(result.current?.phase).toBe('notSetUp'));
    });
    expect(vaultVectorSource.read(rootPath)).toBeNull();
  });

  it('resumes without ever asking for a download', async () => {
    vaultVectorSource.write(rootPath, { kind: 'builtin' });
    vi.mocked(prepareVectors).mockResolvedValueOnce({ ...OFF_VECTOR_STATUS, phase: 'failed', failure: 'modelGone' });
    await expect(resume(rootPath)).resolves.toBe(true);
    expect(vi.mocked(prepareVectors).mock.calls).toEqual([[rootPath, { kind: 'builtin' }]]);
  });
});
