import { afterEach, describe, expect, it, vi } from 'vitest';

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: tauriApiMock.listen,
}));

import { vaultIndexPreference } from './tauri-vault-index';
import {
  deleteVectorModel,
  deleteVectors,
  OFF_VECTOR_STATUS,
  prepareVectors,
  probeVectors,
  searchVectors,
  stopVectors,
  subscribeVectorStatus,
  vectorStatus,
  warmVectors,
  type VectorSource,
  type VectorStatus,
  type VectorStatusEvent,
} from './tauri-vault-vectors';

const builtin: VectorSource = { kind: 'builtin' };
const runner: VectorSource = { kind: 'runner', baseUrl: 'http://localhost:11434', model: 'bge-m3' };

afterEach(() => {
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
  tauriApiMock.listen.mockReset();
  window.localStorage.clear();
});

describe('tauri-vault-vectors on the web', () => {
  it('answers the off status or an empty result and never calls the app', async () => {
    await expect(vectorStatus('/vault', builtin)).resolves.toEqual(OFF_VECTOR_STATUS);
    await expect(prepareVectors('/vault', builtin)).resolves.toEqual(OFF_VECTOR_STATUS);
    await expect(stopVectors('/vault')).resolves.toEqual(OFF_VECTOR_STATUS);
    await expect(deleteVectors('/vault')).resolves.toEqual(OFF_VECTOR_STATUS);
    await expect(warmVectors(builtin)).resolves.toBeUndefined();
    await expect(deleteVectorModel()).resolves.toBeUndefined();
    await expect(searchVectors('/vault', builtin, '습지', 8)).resolves.toEqual({
      state: 'notReady', failure: null, hits: [], staleDropped: 0, filesReady: 0, filesTotal: 0,
    });
    const probe = await probeVectors('/vault', 'http://localhost:11434');
    expect(probe.files).toBe(0);
    expect(probe.builtin.onDisk).toBe(false);
    expect(probe.runner).toBeNull();
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it('hands out a fresh off status each time, so a caller cannot change the shared one', async () => {
    const status = await vectorStatus('/vault', null);
    status.filesDone = 3;
    expect(OFF_VECTOR_STATUS.filesDone).toBe(0);
  });

  it('subscribes to nothing and unsubscribes without throwing', () => {
    const unsubscribe = subscribeVectorStatus(() => undefined);
    expect(() => unsubscribe()).not.toThrow();
    expect(tauriApiMock.listen).not.toHaveBeenCalled();
  });
});

describe('tauri-vault-vectors in the app', () => {
  it('sends each command its contract arguments in camelCase', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue(undefined);

    await probeVectors('/vault', 'http://localhost:11434');
    await vectorStatus('/vault', runner);
    await prepareVectors('/vault', builtin);
    await stopVectors('/vault');
    await warmVectors(builtin);
    await searchVectors('/vault', runner, '물가의 식물', 8);
    await deleteVectors('/vault');
    await deleteVectorModel();

    expect(tauriApiMock.invoke.mock.calls).toEqual([
      ['vault_vectors_probe', { rootPath: '/vault', runnerBaseUrl: 'http://localhost:11434' }],
      ['vault_vectors_status', { rootPath: '/vault', enabled: true, source: runner }],
      ['vault_vectors_prepare', { rootPath: '/vault', source: builtin }],
      ['vault_vectors_stop', { rootPath: '/vault' }],
      ['vault_vectors_warm', { source: builtin }],
      ['vault_vectors_search', { rootPath: '/vault', source: runner, question: '물가의 식물', limit: 8 }],
      ['vault_vectors_delete', { rootPath: '/vault' }],
      ['vault_vectors_delete_model', undefined],
    ]);
  });

  it('sends the search index switch with the status, since vectors live beside the index', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue(OFF_VECTOR_STATUS);
    vaultIndexPreference.write('off');
    await vectorStatus('/vault', null);
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('vault_vectors_status', {
      rootPath: '/vault', enabled: false, source: null,
    });
  });

  it('keeps a search within the 64 passages a search returns', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({ state: 'ok', failure: null, hits: [], staleDropped: 0, filesReady: 1, filesTotal: 1 });
    await searchVectors('/vault', builtin, 'q', 500);
    await searchVectors('/vault', builtin, 'q', -3);
    expect(tauriApiMock.invoke.mock.calls.map(([, args]) => args.limit)).toEqual([64, 0]);
  });

  it('passes the app answers through unchanged', async () => {
    tauriApiMock.runtimeAvailable = true;
    const status: VectorStatus = {
      ...OFF_VECTOR_STATUS,
      phase: 'preparing',
      filesDone: 120,
      filesTotal: 2000,
      currentPath: 'wiki/sedges.md',
      passagesPerSecond: 11.9,
    };
    const found = {
      state: 'failed', failure: 'runnerDown', hits: [], staleDropped: 0, filesReady: 120, filesTotal: 2000,
    };
    tauriApiMock.invoke.mockResolvedValueOnce(status).mockResolvedValueOnce(found);
    await expect(prepareVectors('/vault', builtin)).resolves.toEqual(status);
    await expect(searchVectors('/vault', runner, 'q', 8)).resolves.toEqual(found);
  });

  it('delivers status events until unsubscribed, even before the listener is attached', async () => {
    tauriApiMock.runtimeAvailable = true;
    let deliver: ((event: { payload: VectorStatusEvent }) => void) | null = null;
    const unlisten = vi.fn();
    let attached: () => void = () => undefined;
    tauriApiMock.listen.mockImplementation((name: string, handler: typeof deliver) => {
      expect(name).toBe('vault-vectors-status');
      deliver = handler;
      return new Promise<() => void>((resolve) => {
        attached = () => resolve(unlisten);
      });
    });
    const heard: VectorStatusEvent[] = [];
    const unsubscribe = subscribeVectorStatus((event) => heard.push(event));
    const event = { rootPath: '/vault', status: { ...OFF_VECTOR_STATUS, phase: 'ready' as const } };
    deliver!({ payload: event });
    attached();
    await Promise.resolve();
    unsubscribe();
    deliver!({ payload: event });
    expect(heard).toEqual([event]);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('lets go of a listener that attaches after the unsubscribe', async () => {
    tauriApiMock.runtimeAvailable = true;
    const unlisten = vi.fn();
    let attached: () => void = () => undefined;
    tauriApiMock.listen.mockImplementation(
      () => new Promise<() => void>((resolve) => {
        attached = () => resolve(unlisten);
      }),
    );
    const unsubscribe = subscribeVectorStatus(() => undefined);
    unsubscribe();
    attached();
    await Promise.resolve();
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
