import { afterEach, describe, expect, it, vi } from 'vitest';

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

import {
  isSecretBridgeAvailable,
  secretClear,
  secretErrorMessage,
  secretSet,
  secretStatus,
  secretVerify,
  subscribeSecretChange,
} from './tauri-secrets';

afterEach(() => {
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
});

describe('tauri secrets bridge', () => {
  it('reports availability from the Tauri runtime at call time', () => {
    expect(isSecretBridgeAvailable()).toBe(false);
    tauriApiMock.runtimeAvailable = true;
    expect(isSecretBridgeAvailable()).toBe(true);
  });

  it('degrades honestly on the web: every wrapper returns null with zero invokes', async () => {
    // In a browser there is nowhere to put a key at all. Degrading to null rather than
    // failing quietly is what stops the caller from rendering an input field.
    expect(await secretStatus('anthropic')).toBeNull();
    expect(await secretSet('anthropic', 'sk-ant-test')).toBeNull();
    expect(await secretClear('anthropic')).toBeNull();
    expect(await secretVerify('anthropic', '/vault')).toBeNull();
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it('passes the key exactly once, on save, and never asks for it back', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({
      provider: 'anthropic',
      stored: true,
      last4: 'abcd',
    });
    expect(await secretSet('anthropic', 'sk-ant-secret')).toEqual({
      provider: 'anthropic',
      stored: true,
      last4: 'abcd',
    });
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('secret_set', {
      provider: 'anthropic',
      secret: 'sk-ant-secret',
    });

    await secretStatus('anthropic');
    // Lookup arguments never carry the key — no command returns one.
    expect(tauriApiMock.invoke).toHaveBeenLastCalledWith('secret_status', {
      provider: 'anthropic',
    });
  });

  it('sends the vault path with a verify so the call can be logged before it leaves', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({
      provider: 'openai',
      ok: true,
      httpStatus: 200,
      message: null,
      durationMs: 640,
      loggedAt: '2026-07-26T09:12:33.120Z',
    });
    const result = await secretVerify('openai', '/vault');
    expect(result?.ok).toBe(true);
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('secret_verify', {
      provider: 'openai',
      vaultPath: '/vault',
      // A named vendor **cannot** override the address; sending an explicit null is the
      // contract. Rust rejects any value here, so there is no path for a key to leave for a
      // host the user typed.
      baseUrl: null,
    });
  });

  it('키 보유 상태가 바뀌면 한 번 알린다 — 듣는 표면이 새로고침 없이 살아나게', async () => {
    // The key is entered on one surface (the settings sheet) and comes alive on another (the
    // map's right dock), so without a signal on save and delete the user has to reload.
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({
      provider: 'anthropic',
      stored: true,
      last4: 'abcd',
    });
    const changes = vi.fn();
    const unsubscribe = subscribeSecretChange(changes);

    await secretSet('anthropic', 'sk-ant-secret');
    expect(changes).toHaveBeenCalledTimes(1);
    await secretClear('anthropic');
    expect(changes).toHaveBeenCalledTimes(2);
    // A lookup changes no state, so it does not notify.
    await secretStatus('anthropic');
    expect(changes).toHaveBeenCalledTimes(2);

    unsubscribe();
    await secretSet('anthropic', 'sk-ant-secret');
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('turns a Rust Err(String) rejection into a single user line', () => {
    // Rust answers with a code now (`src-tauri/src/errors.rs`); the sentence is
    // chosen here, where the reader's locale is known.
    const lookup = (code: string) =>
      code === 'secret-empty' ? 'Paste the key first.' : undefined;
    expect(secretErrorMessage('secret-empty', lookup)).toBe('Paste the key first.');
    expect(secretErrorMessage('keychain-unavailable: locked', lookup)).toBe('locked');
    expect(secretErrorMessage(new Error('boom'))).toBe('boom');
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const storedStatus = (provider = 'anthropic', last4 = 'abcd') => ({ provider, stored: true, last4 });

describe('pending status reads', () => {
  it('shares overlapping provider reads and reads freshly after settlement', async () => {
    tauriApiMock.runtimeAvailable = true;
    const read = deferred<ReturnType<typeof storedStatus>>();
    tauriApiMock.invoke.mockReturnValueOnce(read.promise).mockResolvedValue(storedStatus('anthropic', 'next'));
    const first = secretStatus('anthropic');
    const second = secretStatus('anthropic');
    read.resolve(storedStatus());
    expect(await Promise.all([first, second])).toEqual([storedStatus(), storedStatus()]);
    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(1);
    expect(await secretStatus('anthropic')).toEqual(storedStatus('anthropic', 'next'));
    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(2);
  });

  it('keeps each consumer status object independent', async () => {
    tauriApiMock.runtimeAvailable = true;
    const read = deferred<ReturnType<typeof storedStatus>>();
    tauriApiMock.invoke.mockReturnValue(read.promise);
    const requests = [secretStatus('anthropic'), secretStatus('anthropic')];
    read.resolve(storedStatus());
    const [a, b] = await Promise.all(requests);
    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(1);
    expect(a).not.toBe(b);
    a!.last4 = 'edited';
    expect(b!.last4).toBe('abcd');
  });

  it('keeps providers independent while reads overlap', async () => {
    tauriApiMock.runtimeAvailable = true;
    const a = deferred<ReturnType<typeof storedStatus>>();
    const b = deferred<ReturnType<typeof storedStatus>>();
    tauriApiMock.invoke.mockImplementation((_command, args) => args.provider === 'anthropic' ? a.promise : b.promise);
    const requests = [secretStatus('anthropic'), secretStatus('openai'), secretStatus('anthropic')];
    a.resolve(storedStatus()); b.resolve(storedStatus('openai', 'efgh'));
    expect(await Promise.all(requests)).toEqual([storedStatus(), storedStatus('openai', 'efgh'), storedStatus()]);
    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(2);
  });

  it('releases rejected reads so a retry reaches the native store', async () => {
    tauriApiMock.runtimeAvailable = true;
    const read = deferred<ReturnType<typeof storedStatus>>();
    tauriApiMock.invoke.mockReturnValueOnce(read.promise).mockResolvedValue(storedStatus());
    const requests = [secretStatus('anthropic'), secretStatus('anthropic')];
    const outcomes = Promise.allSettled(requests);
    read.reject(new Error('store locked'));
    expect((await outcomes).every(result => result.status === 'rejected')).toBe(true);
    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(1);
    expect(await secretStatus('anthropic')).toEqual(storedStatus());
    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(2);
  });

  it('does not retain unknown providers in the shared-read map', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockRejectedValue(new Error('unsupported-provider'));
    const unknown = 'unsupported' as Parameters<typeof secretStatus>[0];
    expect((await Promise.allSettled([secretStatus(unknown), secretStatus(unknown)])).every(result => result.status === 'rejected')).toBe(true);
    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(2);
  });

  it.each(['secret_set', 'secret_clear'] as const)('starts a fresh read after failed %s without publishing a mutation event', async command => {
    tauriApiMock.runtimeAvailable = true;
    const old = deferred<ReturnType<typeof storedStatus>>();
    const during = deferred<ReturnType<typeof storedStatus>>();
    const mutation = deferred<ReturnType<typeof storedStatus>>();
    let count = 0;
    tauriApiMock.invoke.mockImplementation(name => name === 'secret_status' ? [old.promise, during.promise, Promise.resolve(storedStatus())][count++] : mutation.promise);
    const changed = vi.fn(); const unsubscribe = subscribeSecretChange(changed);
    const first = secretStatus('anthropic');
    const write = command === 'secret_set' ? secretSet('anthropic', 'synthetic') : secretClear('anthropic');
    const failure = write.catch(error => error);
    const second = secretStatus('anthropic');
    mutation.reject(new Error('write failed')); await failure;
    expect(await secretStatus('anthropic')).toEqual(storedStatus());
    old.resolve(storedStatus()); during.resolve(storedStatus()); await Promise.all([first, second]);
    expect(count).toBe(3); expect(changed).not.toHaveBeenCalled(); unsubscribe();
  });

  it.each(['secret_set', 'secret_clear'] as const)('isolates reads across %s and protects a successor from old cleanup', async command => {
    tauriApiMock.runtimeAvailable = true;
    const reads = [deferred<ReturnType<typeof storedStatus>>(), deferred<ReturnType<typeof storedStatus>>(), deferred<ReturnType<typeof storedStatus>>()];
    const mutation = deferred<ReturnType<typeof storedStatus>>();
    let next = 0;
    tauriApiMock.invoke.mockImplementation((name) => name === 'secret_status' ? reads[next++]!.promise : mutation.promise);
    const before = secretStatus('anthropic');
    const writing = command === 'secret_set' ? secretSet('anthropic', 'synthetic') : secretClear('anthropic');
    const during = secretStatus('anthropic');
    mutation.resolve(storedStatus('anthropic', 'new1')); await writing;
    const after = secretStatus('anthropic');
    reads[0]!.resolve(storedStatus('anthropic', 'old1')); await before;
    const shared = secretStatus('anthropic');
    reads[1]!.resolve(storedStatus('anthropic', 'mid1')); await during;
    reads[2]!.resolve(storedStatus('anthropic', 'new1'));
    expect(await Promise.all([after, shared])).toEqual([storedStatus('anthropic', 'new1'), storedStatus('anthropic', 'new1')]);
    expect(next).toBe(3);
  });
});
