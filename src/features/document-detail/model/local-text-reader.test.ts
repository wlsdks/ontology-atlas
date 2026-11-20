import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  runtime: false,
  reads: [] as string[][],
  singles: [] as string[],
  failInBatch: new Set<string>(),
}));

vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', () => ({
  isTauriVaultRuntime: () => bridge.runtime,
  getTauriVaultRootPath: () => '/vault',
  readTauriVaultTextFiles: async (_root: string, paths: readonly string[]) => {
    bridge.reads.push([...paths]);
    return paths.map((relativePath) =>
      bridge.failInBatch.has(relativePath)
        ? { relativePath, text: null, lastModified: null, error: 'busy' }
        : { relativePath, text: `text of ${relativePath}`, lastModified: 1, error: null },
    );
  },
  readTauriVaultTextFile: async (_root: string, relativePath: string) => {
    bridge.singles.push(relativePath);
    return { text: `alone ${relativePath}`, lastModified: 1 };
  },
}));

import { createLocalTextReader } from './local-text-reader';

function fileHandle(text: string) {
  const getFile = vi.fn(async () => new File([text], 'doc.md'));
  return { handle: { getFile } as unknown as FileSystemFileHandle, getFile };
}

const root = {} as FileSystemDirectoryHandle;

describe('createLocalTextReader', () => {
  beforeEach(() => {
    bridge.runtime = false;
    bridge.reads = [];
    bridge.singles = [];
    bridge.failInBatch = new Set();
  });

  it('reads on the web only through the handle the walk gave the document', async () => {
    const granted = fileHandle('# A');
    const read = createLocalTextReader(root, new Map([['a', granted.handle]]));
    const texts = await read([
      { slug: 'a', path: 'a.md', mtime: 1 },
      { slug: 'a', path: '../outside.md', mtime: 1 },
      { slug: 'missing', path: 'missing.md', mtime: 1 },
    ]);
    expect(texts).toEqual(['# A', null, null]);
    expect(granted.getFile).toHaveBeenCalledTimes(1);
  });

  it('sends the app bridge one batch holding only granted paths', async () => {
    bridge.runtime = true;
    const read = createLocalTextReader(root, new Map([['a', fileHandle('').handle], ['b', fileHandle('').handle]]));
    const texts = await read([
      { slug: 'a', path: 'a.md', mtime: 1 },
      { slug: 'b', path: '/etc/passwd', mtime: 1 },
      { slug: 'b', path: 'b.md', mtime: 1 },
    ]);
    expect(bridge.reads).toEqual([['a.md', 'b.md']]);
    expect(bridge.singles).toEqual([]);
    expect(texts).toEqual(['text of a.md', null, 'text of b.md']);
  });

  it('reads a file whose batch frame carries an error once more on its own', async () => {
    bridge.runtime = true;
    bridge.failInBatch = new Set(['b.md']);
    const read = createLocalTextReader(root, new Map([['a', fileHandle('').handle], ['b', fileHandle('').handle]]));
    const texts = await read([
      { slug: 'a', path: 'a.md', mtime: 1 },
      { slug: 'b', path: 'b.md', mtime: 1 },
    ]);
    expect(bridge.singles).toEqual(['b.md']);
    expect(texts).toEqual(['text of a.md', 'alone b.md']);
  });
});
