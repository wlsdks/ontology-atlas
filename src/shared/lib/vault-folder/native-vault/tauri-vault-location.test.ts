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

import { getTauriVaultRootPath } from './tauri-vault-runtime';
import {
  ensureDefaultVaultParentDir,
  openTauriVaultInFinder,
  pickTauriVaultDirectory,
  vaultRootRejectionReason,
} from './tauri-vault-location';

const installInvoke = (handler: Parameters<typeof installInvokeCalls>[1]) =>
  installInvokeCalls(tauriApiMock, handler);

afterEach(() => resetTauriApiMock(tauriApiMock));

describe('tauri vault location', () => {
  it('picks a native folder and exposes the root path for persistence', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'pick_vault_directory') return '/Users/me/vault';
      throw new Error(`unexpected command: ${command}`);
    });

    const handle = await pickTauriVaultDirectory('Import ontology block');

    expect(handle?.name).toBe('vault');
    expect(getTauriVaultRootPath(handle!)).toBe('/Users/me/vault');
    expect(calls).toEqual([
      {
        command: 'pick_vault_directory',
        args: { dialogTitle: 'Import ontology block' },
      },
    ]);
  });

  it('returns null when the native folder picker is cancelled', async () => {
    installInvoke(({ command }) => {
      if (command === 'pick_vault_directory') return null;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(pickTauriVaultDirectory()).resolves.toBeNull();
  });

  it('opens the selected vault root in Finder through the native command', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'open_vault_in_finder') return undefined;
      throw new Error(`unexpected command: ${command}`);
    });

    await openTauriVaultInFinder('/Users/me/vault');

    expect(calls).toEqual([
      {
        command: 'open_vault_in_finder',
        args: { rootPath: '/Users/me/vault' },
      },
    ]);
  });

  it('fails Finder reveal fast when the WebView invoke runtime is absent', async () => {
    await expect(openTauriVaultInFinder('/vault')).rejects.toThrow(
      'Tauri vault runtime is not available.',
    );
  });

  it('ensures the default vault parent dir and returns its absolute path', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'ensure_default_vault_parent_dir') {
        return '/Users/me/Ontology Atlas';
      }
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(ensureDefaultVaultParentDir()).resolves.toBe(
      '/Users/me/Ontology Atlas',
    );
    expect(calls).toEqual([
      { command: 'ensure_default_vault_parent_dir', args: undefined },
    ]);
  });

  it('returns null for the default vault parent dir when the runtime is unavailable', async () => {
    await expect(ensureDefaultVaultParentDir()).resolves.toBeNull();
  });
});

describe('vaultRootRejectionReason reads a rejection differently from a failure', () => {
  /*
   * Rust returns a reason code and the screen picks its wording from it; if extraction fails the
   * screen would show a retry message, which is false guidance.
   */
  it('extracts the reason code from both an Error and a string', () => {
    expect(vaultRootRejectionReason(new Error('vault-root-rejected:filesystem-root'))).toBe(
      'filesystem-root',
    );
    expect(vaultRootRejectionReason('vault-root-rejected:home-directory')).toBe('home-directory');
    expect(vaultRootRejectionReason('vault-root-rejected:system-directory')).toBe(
      'system-directory',
    );
  });

  it('finds it even when Tauri wraps and throws the original text', () => {
    // `invoke` sometimes returns the command error verbatim and sometimes wraps it in a sentence.
    expect(
      vaultRootRejectionReason(
        new Error('invoke failed: vault-root-rejected:system-directory'),
      ),
    ).toBe('system-directory');
  });

  it('an error that is not a rejection gives null, so an ordinary failure is not mistaken for a rejection', () => {
    expect(vaultRootRejectionReason(new Error('permission denied'))).toBeNull();
    expect(vaultRootRejectionReason(null)).toBeNull();
    expect(vaultRootRejectionReason(undefined)).toBeNull();
    expect(vaultRootRejectionReason({ code: 42 })).toBeNull();
  });

  it('a prefix with an empty reason gives null, so no wording is chosen from an empty code', () => {
    expect(vaultRootRejectionReason('vault-root-rejected:')).toBeNull();
    expect(vaultRootRejectionReason('vault-root-rejected:   ')).toBeNull();
  });
});
