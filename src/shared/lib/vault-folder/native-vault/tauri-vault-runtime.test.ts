import { afterEach, describe, expect, it, vi } from 'vitest';

import { installInvoke as installInvokeCalls, resetTauriApiMock } from '../../../../../tests/helpers/tauri-invoke-calls';

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

import { isTauriVaultRuntime } from './tauri-vault-runtime';

const installInvoke = (handler: Parameters<typeof installInvokeCalls>[1]) =>
  installInvokeCalls(tauriApiMock, handler);

afterEach(() => resetTauriApiMock(tauriApiMock));

describe('tauri vault runtime', () => {
  it('detects the Tauri invoke runtime at call time', () => {
    expect(isTauriVaultRuntime()).toBe(false);
    installInvoke(() => null);
    expect(isTauriVaultRuntime()).toBe(true);
  });
});
