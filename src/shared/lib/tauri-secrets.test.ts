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
    // 브라우저에서는 키를 받을 곳 자체가 없다 — 조용히 실패하는 대신 null 로
    // 강등해 호출부가 입력 필드를 렌더하지 않게 한다.
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
    // 조회 인자에는 키가 없다 — 돌려받을 커맨드 자체가 없다.
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
    });
  });

  it('키 보유 상태가 바뀌면 한 번 알린다 — 듣는 표면이 새로고침 없이 살아나게', async () => {
    // 키를 넣는 곳(설정 시트)과 그 키로 살아나는 곳(지도 오른쪽 도크)이 다른
    // 표면이라, 저장·삭제 순간을 알리지 않으면 사용자가 F5 를 눌러야 한다.
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
    // 조회는 상태를 바꾸지 않으므로 알리지 않는다.
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
