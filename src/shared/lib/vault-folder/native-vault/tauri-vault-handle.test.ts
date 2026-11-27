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

import { createTauriVaultHandle } from './tauri-vault-handle';

const installInvoke = (handler: Parameters<typeof installInvokeCalls>[1]) =>
  installInvokeCalls(tauriApiMock, handler);

afterEach(() => resetTauriApiMock(tauriApiMock));

describe('tauri vault handle', () => {
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

  it('exposes the values iterator required by ontology block import', async () => {
    installInvoke(({ command }) => {
      if (command === 'list_vault_directory') {
        return [
          { name: 'docs', kind: 'directory' },
          { name: 'README.md', kind: 'file' },
        ];
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const root = createTauriVaultHandle('/vault');

    const values = [];
    for await (const handle of root.values()) {
      values.push([handle.kind, handle.name]);
    }

    expect(values).toEqual([
      ['directory', 'docs'],
      ['file', 'README.md'],
    ]);
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
        const stamped = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 137, 80, 78, 71]);
        new DataView(stamped.buffer).setBigUint64(0, BigInt(1_790_000_000_456), true);
        return stamped.buffer;
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
    expect(image.lastModified).toBe(1_790_000_000_456);
  });

  it('holds the bytes of a markdown file the text read refuses, as a browser file does', async () => {
    const legacy = [0x23, 0x20, 0xb0, 0xe1, 0x0a];
    installInvoke(({ command }) => {
      if (command === 'vault_path_exists') return true;
      if (command === 'read_vault_text_file') throw new Error('stream did not contain valid UTF-8');
      if (command === 'read_vault_binary_file') {
        const stamped = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, ...legacy]);
        new DataView(stamped.buffer).setBigUint64(0, BigInt(1_790_000_000_789), true);
        return stamped.buffer;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const file = await (await createTauriVaultHandle('/vault').getFileHandle('legacy.md')).getFile();

    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual(legacy);
    expect(file.type).toBe('text/markdown');
    expect(file.lastModified).toBe(1_790_000_000_789);
  });

  it('answers any other failure of the text read as it is, without reading the bytes', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'vault_path_exists') return true;
      if (command === 'read_vault_text_file') throw new Error('No such file or directory (os error 2)');
      throw new Error(`unexpected command: ${command}`);
    });
    const handle = await createTauriVaultHandle('/vault').getFileHandle('gone.md');

    await expect(handle.getFile()).rejects.toThrow('No such file or directory (os error 2)');
    expect(calls.map((call) => call.command)).not.toContain('read_vault_binary_file');
  });

  it('refuses to write bytes that are not UTF-8 rather than replacing them', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'vault_path_exists') return true;
      if (command === 'write_vault_text_file') return undefined;
      throw new Error(`unexpected command: ${command}`);
    });
    const file = await createTauriVaultHandle('/vault').getFileHandle('legacy.md');
    const writable = await file.createWritable();

    await expect(writable.write(Uint8Array.from([0x23, 0x20, 0xb0, 0xe1, 0x0a]).buffer)).rejects.toMatchObject({ code: 'not-utf8' });
    expect(calls.map((call) => call.command)).not.toContain('write_vault_text_file');
  });

  it('creates directories, creates files, writes accumulated text, and removes files', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'vault_path_exists') return false;
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
        command: 'vault_path_exists',
        args: { rootPath: '/vault', relativePath: 'docs/note.md', kind: 'file' },
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

  it('does not truncate an existing file when getFileHandle create is true', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'vault_path_exists') return true;
      throw new Error(`unexpected command: ${command}`);
    });
    const root = createTauriVaultHandle('/vault');

    const file = await root.getFileHandle('existing.md', { create: true });

    expect(file.name).toBe('existing.md');
    expect(calls).toEqual([
      {
        command: 'vault_path_exists',
        args: { rootPath: '/vault', relativePath: 'existing.md', kind: 'file' },
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
