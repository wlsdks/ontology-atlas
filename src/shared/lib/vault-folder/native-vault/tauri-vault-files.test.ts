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

import { encodeVaultTextFrames } from '../../../../../tests/helpers/vault-text-frames';
import {
  createTauriVaultTextFile,
  ensureTauriChildDirectory,
  listTauriDirectoryNames,
  readTauriVaultTextFiles,
  tauriVaultPathExists,
} from './tauri-vault-files';

const installInvoke = (handler: Parameters<typeof installInvokeCalls>[1]) =>
  installInvokeCalls(tauriApiMock, handler);

afterEach(() => resetTauriApiMock(tauriApiMock));

describe('tauri vault files', () => {
  it('uses the exclusive native command and preserves an existing-target verdict without falling back', async () => {
    let created = true;
    const calls = installInvoke(({ command }) => {
      if (command !== 'create_vault_text_file') throw new Error(`unexpected command: ${command}`);
      return created;
    });
    expect(await createTauriVaultTextFile('/vault', 'wiki/answer.md', 'complete')).toBe(true);
    created = false;
    expect(await createTauriVaultTextFile('/vault', 'wiki/answer.md', 'replacement')).toBe(false);
    expect(calls).toEqual([
      { command: 'create_vault_text_file', args: { rootPath: '/vault', relativePath: 'wiki/answer.md', content: 'complete' } },
      { command: 'create_vault_text_file', args: { rootPath: '/vault', relativePath: 'wiki/answer.md', content: 'replacement' } },
    ]);
  });

  it('fails closed when exclusive native creation is unavailable or unconfirmed', async () => {
    await expect(createTauriVaultTextFile('/vault', 'wiki/answer.md', 'text')).rejects.toThrow('installed app');
    installInvoke(() => undefined);
    await expect(createTauriVaultTextFile('/vault', 'wiki/answer.md', 'text')).rejects.toThrow('did not confirm');
  });

  it('checks whether a native vault root path exists', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'vault_path_exists') return true;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(tauriVaultPathExists('/Users/me/vault')).resolves.toBe(true);

    expect(calls).toEqual([
      {
        command: 'vault_path_exists',
        args: { rootPath: '/Users/me/vault', relativePath: '', kind: 'directory' },
      },
    ]);
  });

  it('reports native vault root paths as absent when the runtime is unavailable', async () => {
    await expect(tauriVaultPathExists('/Users/me/vault')).resolves.toBe(false);
  });

  it('reads a batch as framed bytes and hands back each file or its reason', async () => {
    const answer = [
      { relativePath: 'domains/order.md', text: '# order', lastModified: 123, error: null },
      { relativePath: '.env.md', text: null, lastModified: null, error: 'dot folder' },
    ];
    const calls = installInvoke(() => encodeVaultTextFrames(answer));

    const reads = await readTauriVaultTextFiles('/vault', ['domains/order.md', '.env.md']);

    expect(calls).toEqual([
      {
        command: 'read_vault_text_files',
        args: { rootPath: '/vault', relativePaths: ['domains/order.md', '.env.md'] },
      },
    ]);
    expect(reads).toEqual(answer);
  });

  it('lists only directory names at the root of a path', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'list_vault_directory') {
        return [
          { name: 'my-ontology', kind: 'directory' },
          { name: 'notes.md', kind: 'file' },
          { name: 'my-ontology-2', kind: 'directory' },
        ];
      }
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(
      listTauriDirectoryNames('/Users/me/Ontology Atlas'),
    ).resolves.toEqual(['my-ontology', 'my-ontology-2']);
    expect(calls).toEqual([
      {
        command: 'list_vault_directory',
        args: { rootPath: '/Users/me/Ontology Atlas', relativePath: '' },
      },
    ]);
  });

  it('returns an empty directory listing when the runtime is unavailable', async () => {
    await expect(listTauriDirectoryNames('/vault')).resolves.toEqual([]);
  });

  it('ensures a named child directory exists under a root path', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'ensure_vault_directory') return undefined;
      throw new Error(`unexpected command: ${command}`);
    });

    await ensureTauriChildDirectory('/Users/me/Ontology Atlas', 'my-ontology');

    expect(calls).toEqual([
      {
        command: 'ensure_vault_directory',
        args: {
          rootPath: '/Users/me/Ontology Atlas',
          relativePath: 'my-ontology',
        },
      },
    ]);
  });

  it('fails fast ensuring a child directory when the WebView invoke runtime is absent', async () => {
    await expect(ensureTauriChildDirectory('/vault', 'my-ontology')).rejects.toThrow(
      'Tauri vault runtime is not available.',
    );
  });
});
