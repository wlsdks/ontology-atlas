import { afterEach, describe, expect, it, vi } from 'vitest';
import { walkVault } from '@/entities/docs-vault/lib/walk-vault';
import { addSourcesInBrowser } from './add-sources';

afterEach(() => vi.unstubAllGlobals());

function fixture(existing: string[] = [], failure = false) {
  vi.stubGlobal('crypto', undefined);
  const file = (name: string) => ({ kind: 'file', name, getFile: async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) });
  const entries = new Map(existing.map(name => [name, file(name)]));
  let release!: () => void;
  let started!: () => void;
  const writing = new Promise<void>(r => { started = r; });
  const write = new Promise<void>(r => { release = r; });
  const abort = vi.fn();
  const sources = {
    kind: 'directory', name: 'sources',
    async *entries() { yield* entries; },
    async getFileHandle(name: string) {
      entries.set(name, file(name));
      const swap = `${name}.crswap`;
      const hadSwap = entries.has(swap);
      return { ...file(name), createWritable: async () => {
        if (!hadSwap) entries.set(swap, file(swap));
        return { write: async () => { started(); await write; if (failure) throw new Error('Copy refused'); }, close: async () => { if (!hadSwap) entries.delete(swap); }, abort: async () => { abort(); if (!hadSwap) entries.delete(swap); } };
      } };
    },
  };
  const outside = new Map<string, ReturnType<typeof file>>();
  const root = {
    name: 'vault', kind: 'directory',
    async getDirectoryHandle() { return sources; },
    async *entries() { yield ['sources', sources]; yield* outside; },
    async isSameEntry(other: unknown) { return other === root || other === reopened; },
  } as unknown as FileSystemDirectoryHandle;
  const reopened = { ...root, isSameEntry: async (other: unknown) => other === root || other === reopened } as FileSystemDirectoryHandle;
  const pick = { name: 'new.txt', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as File;
  return { root, reopened, pick, writing, release, entries, outside, file, abort };
}

async function paths(root: FileSystemDirectoryHandle) {
  return (await walkVault(root)).entries.map(e => e.relativePath).sort();
}

describe('source copy publication', () => {
  it('withholds its unfinished original and swap while keeping unrelated changes visible', async () => {
    const f = fixture(['kept.txt']);
    const importing = addSourcesInBrowser(f.root, [f.pick]);
    await f.writing;
    f.entries.set('external.txt', f.file('external.txt'));
    f.outside.set('changed.md', f.file('changed.md'));
    f.entries.set('kept.txt', { ...f.file('kept.txt'), getFile: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }) });
    expect(await paths(f.root)).toEqual(['changed.md', 'sources/external.txt', 'sources/kept.txt']);
    expect(await paths(f.reopened)).toEqual(['changed.md', 'sources/external.txt', 'sources/kept.txt']);
    const kept = (await walkVault(f.root)).entries.find(e => e.relativePath === 'sources/kept.txt')!;
    expect((await (await kept.handle.getFile()).arrayBuffer()).byteLength).toBe(8);
    f.release();
    const result = await importing;
    expect(result.results[0]?.status).toBe('added');
    expect(await paths(f.root)).toEqual(['changed.md', 'sources/external.txt', 'sources/kept.txt', 'sources/new.txt']);
  });

  it('keeps completed members private until the complete selected batch settles', async () => {
    const f = fixture();
    let releaseSecond!: (bytes: ArrayBuffer) => void;
    let readingSecond!: () => void;
    const secondRead = new Promise<void>(resolve => { readingSecond = resolve; });
    const secondBytes = new Promise<ArrayBuffer>(resolve => { releaseSecond = resolve; });
    const second = { name: 'second.txt', size: 4, arrayBuffer: () => { readingSecond(); return secondBytes; } } as File;
    const importing = addSourcesInBrowser(f.root, [f.pick, second]);
    await f.writing;
    f.release();
    await secondRead;
    expect(await paths(f.root)).toEqual([]);
    releaseSecond(new ArrayBuffer(4));
    expect((await importing).results.map(r => r.status)).toEqual(['added', 'added']);
    expect(await paths(f.root)).toEqual(['sources/new.txt', 'sources/second.txt']);
  });

  it('does not hide matching paths in an unrelated folder with the same name', async () => {
    const f = fixture();
    const other = fixture(['new.txt', 'new.txt.crswap']);
    const importing = addSourcesInBrowser(f.root, [f.pick]);
    await f.writing;
    try { expect(await paths(other.root)).toEqual(['sources/new.txt', 'sources/new.txt.crswap']); }
    finally { f.release(); await importing; }
  });

  it('aborts a refused writable and releases its read barrier without deleting originals', async () => {
    const f = fixture(['kept.txt'], true);
    const importing = addSourcesInBrowser(f.root, [f.pick]);
    await f.writing;
    expect(await paths(f.root)).toEqual(['sources/kept.txt']);
    f.release();
    const outcome = await importing;
    expect(outcome.results).toEqual([expect.objectContaining({ status: 'failed', reason: 'Copy refused' })]);
    expect(f.abort).toHaveBeenCalledOnce();
    expect(await paths(f.root)).toEqual(['sources/kept.txt', 'sources/new.txt']);
  });

  it('keeps a legitimate existing swap-like filename visible during the copy', async () => {
    const f = fixture(['new.txt.crswap']);
    const importing = addSourcesInBrowser(f.root, [f.pick]);
    await f.writing;
    expect(await paths(f.root)).toEqual(['sources/new.txt.crswap']);
    f.release();
    await importing;
    expect(await paths(f.root)).toEqual(['sources/new.txt', 'sources/new.txt.crswap']);
  });
});
