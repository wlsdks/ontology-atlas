import { afterEach, describe, expect, it, vi } from 'vitest';

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

import { pickHarnessScopeFile, readHarnessScopes } from './tauri-harness-scopes';

afterEach(() => {
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
});

describe('agent settings scopes bridge', () => {
  it('reads nothing on the web, so no empty list stands for files it could not see', async () => {
    expect(await readHarnessScopes('/vault', 'shop')).toBeNull();
    expect(await pickHarnessScopeFile('Show another settings file')).toBeNull();
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it('sends the vault and project, never a settings path', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({ files: [] });
    await readHarnessScopes('/work/vault', 'shop');
    await pickHarnessScopeFile('Show another settings file');
    expect(tauriApiMock.invoke.mock.calls).toEqual([
      ['read_harness_scopes', { vaultPath: '/work/vault', projectSlug: 'shop' }],
      ['pick_harness_scope_file', { dialogTitle: 'Show another settings file' }],
    ]);
  });
});
