import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  runtime: false,
  reads: [] as string[][],
  singles: [] as string[],
  failInBatch: new Set<string>(),
  failAlone: new Set<string>(),
}));

vi.mock('./native-vault/tauri-vault-files', () => ({
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
    if (bridge.failAlone.has(relativePath)) throw new Error('not found');
    return { text: `alone ${relativePath}`, lastModified: 1 };
  },
}));

import { createVaultTextReader } from './vault-text-reader';

function fileHandle(text: string) {
  const getFile = vi.fn(async () => new File([text], 'doc.md'));
  return { handle: { getFile } as unknown as FileSystemFileHandle, getFile };
}

const nativeRoot = () => (bridge.runtime ? '/vault' : null);

describe('createVaultTextReader', () => {
  beforeEach(() => {
    bridge.runtime = false;
    bridge.reads = [];
    bridge.singles = [];
    bridge.failInBatch = new Set();
    bridge.failAlone = new Set();
  });

  it('reads on the web only through the handle the walk gave the document', async () => {
    const granted = fileHandle('# A');
    const read = createVaultTextReader(nativeRoot(), new Map([['a', granted.handle]]));
    const texts = await read([
      { slug: 'a', path: 'a.md' },
      { slug: 'a', path: '../outside.md' },
      { slug: 'missing', path: 'missing.md' },
    ]);
    expect(texts).toEqual(['# A', null, null]);
    expect(granted.getFile).toHaveBeenCalledTimes(1);
  });

  it('sends the app bridge one batch holding only granted paths', async () => {
    bridge.runtime = true;
    const read = createVaultTextReader(nativeRoot(), new Map([['a', fileHandle('').handle], ['b', fileHandle('').handle]]));
    const texts = await read([
      { slug: 'a', path: 'a.md' },
      { slug: 'b', path: '/etc/passwd' },
      { slug: 'b', path: 'b.md' },
    ]);
    expect(bridge.reads).toEqual([['a.md', 'b.md']]);
    expect(bridge.singles).toEqual([]);
    expect(texts).toEqual(['text of a.md', null, 'text of b.md']);
  });

  it('reads a file whose batch frame carries an error once more on its own', async () => {
    bridge.runtime = true;
    bridge.failInBatch = new Set(['b.md']);
    const read = createVaultTextReader(nativeRoot(), new Map([['a', fileHandle('').handle], ['b', fileHandle('').handle]]));
    const texts = await read([
      { slug: 'a', path: 'a.md' },
      { slug: 'b', path: 'b.md' },
    ]);
    expect(bridge.singles).toEqual(['b.md']);
    expect(texts).toEqual(['text of a.md', 'alone b.md']);
  });

  it('falls back to the file handle when the bridge cannot open the path on its own', async () => {
    bridge.runtime = true;
    bridge.failInBatch = new Set(['b.md']);
    bridge.failAlone = new Set(['b.md']);
    const b = fileHandle('handle text of b');
    const read = createVaultTextReader(nativeRoot(), new Map([['a', fileHandle('').handle], ['b', b.handle]]));
    const texts = await read([
      { slug: 'a', path: 'a.md' },
      { slug: 'b', path: 'b.md' },
    ]);
    expect(texts).toEqual(['text of a.md', 'handle text of b']);
    expect(b.getFile).toHaveBeenCalledTimes(1);
  });
});
