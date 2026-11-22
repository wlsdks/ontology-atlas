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
  clearVaultIndex,
  searchVaultIndex,
  syncVaultIndex,
  vaultIndexPreference,
  vaultIndexStatus,
} from './tauri-vault-index';

afterEach(() => {
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
  window.localStorage.clear();
});

describe('tauri-vault-index', () => {
  it('answers nothing on the web, where search covers titles', async () => {
    expect(await searchVaultIndex('/vault', '지도', 20)).toBeNull();
    expect(await syncVaultIndex('/vault', true)).toBeNull();
    expect(await vaultIndexStatus('/vault')).toBeNull();
    expect(await clearVaultIndex(null)).toBeNull();
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it('is on by default and sends the switch with every command', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({ hits: [], status: {} });
    expect(vaultIndexPreference.read()).toBe('on');

    await searchVaultIndex('/vault', '지도', 20);
    await syncVaultIndex('/vault', true);
    expect(tauriApiMock.invoke).toHaveBeenNthCalledWith(1, 'vault_index_search', {
      rootPath: '/vault', query: '지도', limit: 20, enabled: true,
    });
    expect(tauriApiMock.invoke).toHaveBeenNthCalledWith(2, 'vault_index_sync', {
      rootPath: '/vault', enabled: true, opened: true,
    });

    vaultIndexPreference.write('off');
    await syncVaultIndex('/vault', false);
    await vaultIndexStatus(null);
    expect(tauriApiMock.invoke).toHaveBeenNthCalledWith(3, 'vault_index_sync', {
      rootPath: '/vault', enabled: false, opened: false,
    });
    expect(tauriApiMock.invoke).toHaveBeenNthCalledWith(4, 'vault_index_status', {
      rootPath: null, enabled: false,
    });
  });
});
