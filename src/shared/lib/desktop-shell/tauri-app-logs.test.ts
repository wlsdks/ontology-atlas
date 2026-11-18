import { afterEach, describe, expect, it, vi } from 'vitest';

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

import { canRevealAppLogFolder, revealAppLogFolder } from './tauri-app-logs';

afterEach(() => {
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
});

describe('revealAppLogFolder', () => {
  it('calls the native command with no arguments, so the screen never names a path', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue(undefined);

    await revealAppLogFolder();

    expect(tauriApiMock.invoke.mock.calls).toEqual([['reveal_app_log_dir']]);
  });

  it('refuses outside the desktop app without invoking anything', async () => {
    expect(canRevealAppLogFolder()).toBe(false);
    await expect(revealAppLogFolder()).rejects.toThrow('desktop app');
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it('passes a native failure through', async () => {
    tauriApiMock.runtimeAvailable = true;
    const failure = 'reveal-failed: No such file or directory (os error 2)';
    tauriApiMock.invoke.mockRejectedValue(failure);

    await expect(revealAppLogFolder()).rejects.toBe(failure);
  });
});
