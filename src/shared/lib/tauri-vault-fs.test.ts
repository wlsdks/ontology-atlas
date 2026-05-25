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
  createTauriVaultHandle,
  getTauriVaultRootPath,
  isTauriVaultRuntime,
  openTauriVaultInFinder,
  pickTauriVaultDirectory,
} from './tauri-vault-fs';

type InvokeCall = {
  command: string;
  args?: Record<string, unknown>;
};

function installInvoke(handler: (call: InvokeCall) => unknown): InvokeCall[] {
  const calls: InvokeCall[] = [];
  tauriApiMock.runtimeAvailable = true;
  tauriApiMock.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    const call = { command, args };
    calls.push(call);
    return handler(call);
  });
  return calls;
}

afterEach(() => {
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
});

describe('tauri vault file-system shim', () => {
  it('detects the Tauri invoke runtime at call time', () => {
    expect(isTauriVaultRuntime()).toBe(false);
    installInvoke(() => null);
    expect(isTauriVaultRuntime()).toBe(true);
  });

  it('picks a native folder and exposes the root path for persistence', async () => {
    installInvoke(({ command }) => {
      if (command === 'pick_vault_directory') return '/Users/me/vault';
      throw new Error(`unexpected command: ${command}`);
    });

    const handle = await pickTauriVaultDirectory();

    expect(handle?.name).toBe('vault');
    expect(getTauriVaultRootPath(handle!)).toBe('/Users/me/vault');
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

  it('lists files and directories with nested relative paths', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'list_vault_directory') {
        return [
          { name: 'docs', kind: 'directory' },
          { name: 'README.md', kind: 'file' },
        ];
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const root = createTauriVaultHandle('/vault');

    const entries = [];
    for await (const [name, handle] of root.entries()) {
      entries.push([name, handle.kind, handle.name]);
    }

    expect(entries).toEqual([
      ['docs', 'directory', 'docs'],
      ['README.md', 'file', 'README.md'],
    ]);
    expect(calls[0]).toEqual({
      command: 'list_vault_directory',
      args: { rootPath: '/vault', relativePath: '' },
    });
  });

  it('reads markdown through the text command and binary assets through the binary command', async () => {
    installInvoke(({ command, args }) => {
      if (command === 'vault_path_exists') return true;
      if (command === 'read_vault_text_file') {
        expect(args?.relativePath).toBe('README.md');
        return { text: '# Hello', lastModified: 123 };
      }
      if (command === 'read_vault_binary_file') {
        expect(args?.relativePath).toBe('image.png');
        return { bytes: [137, 80, 78, 71], lastModified: 456 };
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const root = createTauriVaultHandle('/vault');

    const markdown = await (await root.getFileHandle('README.md')).getFile();
    const image = await (await root.getFileHandle('image.png')).getFile();

    expect(await markdown.text()).toBe('# Hello');
    expect(markdown.type).toBe('text/markdown');
    expect(markdown.lastModified).toBe(123);
    expect(image.type).toBe('image/png');
    expect([...new Uint8Array(await image.arrayBuffer())]).toEqual([137, 80, 78, 71]);
    expect(image.lastModified).toBe(456);
  });

  it('creates directories, creates files, writes accumulated text, and removes files', async () => {
    const calls = installInvoke(({ command }) => {
      if (
        command === 'ensure_vault_directory' ||
        command === 'write_vault_text_file' ||
        command === 'remove_vault_entry'
      ) {
        return undefined;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const root = createTauriVaultHandle('/vault');

    const docs = await root.getDirectoryHandle('docs', { create: true });
    const file = await docs.getFileHandle('note.md', { create: true });
    const writable = await file.createWritable();
    await writable.write('hello ');
    await writable.write(new Blob(['world']));
    await writable.close();
    await docs.removeEntry('note.md');

    expect(calls).toEqual([
      {
        command: 'ensure_vault_directory',
        args: { rootPath: '/vault', relativePath: 'docs' },
      },
      {
        command: 'write_vault_text_file',
        args: { rootPath: '/vault', relativePath: 'docs/note.md', content: '' },
      },
      {
        command: 'write_vault_text_file',
        args: { rootPath: '/vault', relativePath: 'docs/note.md', content: 'hello world' },
      },
      {
        command: 'remove_vault_entry',
        args: { rootPath: '/vault', relativePath: 'docs/note.md', recursive: false },
      },
    ]);
  });

  it('removes directories through the native entry command with recursive intent', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'vault_path_exists') return true;
      if (command === 'remove_vault_entry') return undefined;
      throw new Error(`unexpected command: ${command}`);
    });
    const root = createTauriVaultHandle('/vault');
    const docs = await root.getDirectoryHandle('docs', { create: false });

    await docs.removeEntry('generated', { recursive: true });

    expect(calls).toEqual([
      {
        command: 'vault_path_exists',
        args: { rootPath: '/vault', relativePath: 'docs', kind: 'directory' },
      },
      {
        command: 'remove_vault_entry',
        args: { rootPath: '/vault', relativePath: 'docs/generated', recursive: true },
      },
    ]);
  });

  it('throws NotFoundError when a file or directory is absent', async () => {
    installInvoke(({ command }) => {
      if (command === 'vault_path_exists') return false;
      throw new Error(`unexpected command: ${command}`);
    });
    const root = createTauriVaultHandle('/vault');

    await expect(root.getFileHandle('missing.md')).rejects.toMatchObject({
      name: 'NotFoundError',
    });
    await expect(root.getDirectoryHandle('missing')).rejects.toMatchObject({
      name: 'NotFoundError',
    });
  });

  it('fails fast when the WebView invoke runtime is absent', () => {
    expect(() => createTauriVaultHandle('/vault')).toThrow(
      'Tauri vault runtime is not available.',
    );
  });
});
