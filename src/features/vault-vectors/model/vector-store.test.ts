import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OFF_VECTOR_STATUS, prepareVectors, vectorStatus } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { vaultVectorSource } from '@/shared/lib/vault-folder/vault-vector-source';
import { afterJob, prepare, resume, useVectorStatus } from './vector-store';

const events = vi.hoisted(() => ({
  send: null as ((event: import('@/shared/lib/vault-folder/tauri-vault-vectors').VectorStatusEvent) => void) | null,
}));
vi.mock('@/shared/lib/vault-folder/tauri-vault-vectors', async (original) => ({
  ...(await original<typeof import('@/shared/lib/vault-folder/tauri-vault-vectors')>()),
  prepareVectors: vi.fn(),
  vectorStatus: vi.fn(),
  subscribeVectorStatus: (listener: NonNullable<typeof events.send>) => {
    events.send = listener;
    return () => undefined;
  },
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

  it('keeps the earlier choice and its status when the app refuses a switch to another model', async () => {
    vaultVectorSource.write(rootPath, { kind: 'builtin' });
    vi.mocked(vectorStatus).mockResolvedValue(ready);
    vi.mocked(prepareVectors).mockRejectedValueOnce('embed-model-missing');
    const { result } = renderHook(() => useVectorStatus(rootPath));
    await act(async () => {
      await expect(prepare(rootPath, { kind: 'runner', baseUrl: 'http://127.0.0.1:11434', model: 'bge-m3:latest' })).resolves.toBe(false);
    });
    expect(vaultVectorSource.read(rootPath)).toEqual({ source: { kind: 'builtin' }, paused: false });
    expect(result.current?.phase).toBe('ready');
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

describe('waiting for a folder job to end', () => {
  it('resolves at the first status the app publishes with no pass running, not before', async () => {
    // What the folder held before the search answered `busy` does not end the wait.
    vaultVectorSource.write(rootPath, { kind: 'builtin' });
    vi.mocked(vectorStatus).mockResolvedValueOnce(ready);
    renderHook(() => useVectorStatus(rootPath));
    await act(async () => {});
    let ended = false;
    const waiting = afterJob(rootPath).then(() => { ended = true; });
    events.send!({ rootPath: '/another-folder', status: ready });
    await act(async () => {});
    expect(ended).toBe(false);
    events.send!({ rootPath, status: { ...ready, busy: true } });
    events.send!({ rootPath: '/another-folder', status: ready });
    await act(async () => {});
    expect(ended).toBe(false);

    events.send!({ rootPath, status: { ...ready } });
    await waiting;
    expect(ended).toBe(true);
  });
});
