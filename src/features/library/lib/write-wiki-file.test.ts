import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWikiFile, writeWikiFile } from './write-wiki-file';

const native = vi.hoisted(() => ({ root: '/vault' as string | undefined, create: vi.fn() }));
vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', () => ({
  getTauriVaultRootPath: () => native.root,
  createTauriVaultTextFile: native.create,
}));

function vault() {
  const write = vi.fn();
  const close = vi.fn();
  const getFileHandle = vi.fn(async () => ({ createWritable: async () => ({ write, close }) }));
  const root = { getDirectoryHandle: vi.fn(), getFileHandle };
  root.getDirectoryHandle.mockResolvedValue(root);
  return { handle: root as unknown as FileSystemDirectoryHandle, root, write, close };
}

beforeEach(() => { native.root = '/vault'; native.create.mockReset().mockResolvedValue(true); });

describe('createWikiFile', () => {
  it('creates only parent directories before exclusive publication, never an empty target', async () => {
    const view = vault();
    expect(await createWikiFile(view.handle, 'wiki/answers/a.md', 'complete')).toBe(true);
    expect(view.root.getDirectoryHandle.mock.calls).toEqual([['wiki', { create: true }], ['answers', { create: true }]]);
    expect(view.root.getFileHandle).not.toHaveBeenCalled();
    expect(native.create).toHaveBeenCalledWith('/vault', 'wiki/answers/a.md', 'complete');
  });

  it('does not replace an existing target or use an unsafe browser fallback', async () => {
    const view = vault();
    native.create.mockResolvedValue(false);
    expect(await createWikiFile(view.handle, 'wiki/a.md', 'replacement')).toBe(false);
    expect(view.write).not.toHaveBeenCalled();
    native.root = undefined;
    view.root.getDirectoryHandle.mockClear();
    await expect(createWikiFile(view.handle, 'wiki/a.md', 'text')).rejects.toThrow('installed app');
    expect(view.root.getDirectoryHandle).not.toHaveBeenCalled();
  });

  it.each(['../a.md', '/wiki/a.md', 'wiki/../a.md', 'wiki//a.md', 'wiki/a.txt'])('rejects %s before creating parents', async (path) => {
    const view = vault();
    await expect(createWikiFile(view.handle, path, 'text')).rejects.toThrow('vault-relative Markdown path');
    expect(view.root.getDirectoryHandle).not.toHaveBeenCalled();
    expect(native.create).not.toHaveBeenCalled();
  });

  it('leaves the existing browser writer available for browser New page', async () => {
    native.root = undefined;
    const view = vault();
    await writeWikiFile(view.handle, 'wiki/a.md', 'browser content');
    expect(view.write).toHaveBeenCalledWith('browser content');
    expect(view.close).toHaveBeenCalledOnce();
    expect(native.create).not.toHaveBeenCalled();
  });
});
