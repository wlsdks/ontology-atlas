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
    expect(secretErrorMessage('키가 비어 있어요.')).toBe('키가 비어 있어요.');
    expect(secretErrorMessage(new Error('boom'))).toBe('boom');
  });
});
