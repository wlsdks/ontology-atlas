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
  ensureDefaultVaultParentDir,
  ensureTauriChildDirectory,
  getTauriVaultRootPath,
  isTauriVaultRuntime,
  listTauriDirectoryNames,
  openTauriVaultInFinder,
  vaultRootRejectionReason,
  pickTauriVaultDirectory,
  inspectTauriProjectSource,
  tauriVaultPathExists,
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

  it('inspects a project source through the native command', async () => {
    const inspection = {
      rootPath: '/Users/me/repo',
      sourceId: 'sha256:source',
      kind: 'git' as const,
      revision: 'abc123',
      fingerprint: 'sha256:fingerprint',
      dirty: false,
      truncated: false,
      files: ['README.md', 'src/index.ts'],
    };
    const calls = installInvoke(({ command }) => {
      if (command === 'inspect_project_source') return inspection;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(inspectTauriProjectSource('/Users/me/repo/packages/app')).resolves.toEqual(
      inspection,
    );
    expect(calls).toEqual([
      {
        command: 'inspect_project_source',
        args: { rootPath: '/Users/me/repo/packages/app' },
      },
    ]);
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

  it('ensures the default vault parent dir under Documents and returns its absolute path', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'ensure_default_vault_parent_dir') {
        return '/Users/me/Documents/Ontology Atlas';
      }
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(ensureDefaultVaultParentDir()).resolves.toBe(
      '/Users/me/Documents/Ontology Atlas',
    );
    expect(calls).toEqual([
      { command: 'ensure_default_vault_parent_dir', args: undefined },
    ]);
  });

  it('returns null for the default vault parent dir when the runtime is unavailable', async () => {
    await expect(ensureDefaultVaultParentDir()).resolves.toBeNull();
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
      listTauriDirectoryNames('/Users/me/Documents/Ontology Atlas'),
    ).resolves.toEqual(['my-ontology', 'my-ontology-2']);
    expect(calls).toEqual([
      {
        command: 'list_vault_directory',
        args: { rootPath: '/Users/me/Documents/Ontology Atlas', relativePath: '' },
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

    await ensureTauriChildDirectory('/Users/me/Documents/Ontology Atlas', 'my-ontology');

    expect(calls).toEqual([
      {
        command: 'ensure_vault_directory',
        args: {
          rootPath: '/Users/me/Documents/Ontology Atlas',
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

describe('vaultRootRejectionReason — 거절은 실패와 다르게 읽힌다', () => {
  /*
   * 2026-08-16 — the folder picker accepted `/` (Macintosh HD) as a vault, and the only thing
   * that stopped it was a macOS warning dialog. Rust now returns a reason code and the screen
   * picks its own wording from that code. If this parser fails to extract the code, the screen
   * falls back to "couldn't open the folder, please try again" — false guidance, because
   * trying again gives the same result every time.
   */
  it('사유 코드를 뽑아낸다 — Error 와 문자열 둘 다', () => {
    expect(vaultRootRejectionReason(new Error('vault-root-rejected:filesystem-root'))).toBe(
      'filesystem-root',
    );
    expect(vaultRootRejectionReason('vault-root-rejected:home-directory')).toBe('home-directory');
    expect(vaultRootRejectionReason('vault-root-rejected:system-directory')).toBe(
      'system-directory',
    );
  });

  it('Tauri 가 원문을 감싸 던져도 찾아낸다', () => {
    // `invoke` sometimes returns the command error verbatim and sometimes wraps it in a sentence.
    expect(
      vaultRootRejectionReason(
        new Error('invoke failed: vault-root-rejected:system-directory'),
      ),
    ).toBe('system-directory');
  });

  it('거절이 아닌 오류는 null — 평범한 실패를 거절로 오인하지 않는다', () => {
    expect(vaultRootRejectionReason(new Error('permission denied'))).toBeNull();
    expect(vaultRootRejectionReason(null)).toBeNull();
    expect(vaultRootRejectionReason(undefined)).toBeNull();
    expect(vaultRootRejectionReason({ code: 42 })).toBeNull();
  });

  it('접두사만 있고 사유가 비면 null — 빈 코드로 문구를 고르지 않는다', () => {
    expect(vaultRootRejectionReason('vault-root-rejected:')).toBeNull();
    expect(vaultRootRejectionReason('vault-root-rejected:   ')).toBeNull();
  });
});
