import { describe, expect, it } from 'vitest';
import {
  readBlockDirectory,
  writeBlockToDirectory,
  type BlockDirectoryHandleLike,
  type BlockDirEntryLike,
} from './block-fsa';

/** An in-memory fake implementing only the structural minimum of an FSA DirectoryHandle. */
interface FakeDir {
  kind: 'directory';
  name: string;
  children: Map<string, FakeDir | FakeFile>;
}
interface FakeFile {
  kind: 'file';
  name: string;
  content: string;
}

function dirHandle(dir: FakeDir): BlockDirectoryHandleLike {
  return {
    kind: 'directory',
    name: dir.name,
    async *values(): AsyncIterableIterator<BlockDirEntryLike> {
      for (const child of dir.children.values()) {
        if (child.kind === 'directory') yield dirHandle(child);
        else
          yield {
            kind: 'file',
            name: child.name,
            getFile: async () => ({ text: async () => child.content }),
          };
      }
    },
    getDirectoryHandle: async (name: string, opts?: { create?: boolean }) => {
      const existing = dir.children.get(name);
      if (existing?.kind === 'directory') return dirHandle(existing);
      if (!opts?.create) throw new Error(`no dir ${name}`);
      const next: FakeDir = { kind: 'directory', name, children: new Map() };
      dir.children.set(name, next);
      return dirHandle(next);
    },
    getFileHandle: async (name: string, opts?: { create?: boolean }) => {
      const existing = dir.children.get(name);
      if (!existing && !opts?.create) throw new Error(`no file ${name}`);
      const file: FakeFile =
        existing?.kind === 'file' ? existing : { kind: 'file', name, content: '' };
      dir.children.set(name, file);
      return {
        kind: 'file',
        name,
        getFile: async () => ({ text: async () => file.content }),
        createWritable: async () => ({
          write: async (c: string) => {
            file.content = c;
          },
          close: async () => undefined,
        }),
      };
    },
  };
}

function makeDir(name = 'root'): { fake: FakeDir; handle: BlockDirectoryHandleLike } {
  const fake: FakeDir = { kind: 'directory', name, children: new Map() };
  return { fake, handle: dirHandle(fake) };
}

describe('readBlockDirectory', () => {
  it('walks nested folders, returns .md files with relative paths + the root manifest raw', async () => {
    const { fake, handle } = makeDir('block');
    fake.children.set('block-manifest.json', {
      kind: 'file',
      name: 'block-manifest.json',
      content: '{"blockName":"b"}',
    });
    const caps: FakeDir = { kind: 'directory', name: 'capabilities', children: new Map() };
    caps.children.set('login.md', { kind: 'file', name: 'login.md', content: 'LOGIN' });
    fake.children.set('capabilities', caps);
    fake.children.set('notes.txt', { kind: 'file', name: 'notes.txt', content: 'x' });

    const result = await readBlockDirectory(handle);
    expect(result.files).toEqual([{ path: 'capabilities/login.md', raw: 'LOGIN' }]);
    expect(result.manifestRaw).toBe('{"blockName":"b"}');
  });

  it('skips dotfiles and node_modules (CLI collectMarkdownFiles parity)', async () => {
    const { fake, handle } = makeDir('block');
    const hidden: FakeDir = { kind: 'directory', name: '.git', children: new Map() };
    hidden.children.set('a.md', { kind: 'file', name: 'a.md', content: 'A' });
    fake.children.set('.git', hidden);
    const nm: FakeDir = { kind: 'directory', name: 'node_modules', children: new Map() };
    nm.children.set('b.md', { kind: 'file', name: 'b.md', content: 'B' });
    fake.children.set('node_modules', nm);

    const result = await readBlockDirectory(handle);
    expect(result.files).toEqual([]);
    expect(result.manifestRaw).toBeNull();
  });
});

describe('writeBlockToDirectory', () => {
  it('writes each doc under its slug path (creating folders) plus the manifest json', async () => {
    const { fake, handle } = makeDir('target');
    await writeBlockToDirectory(handle, [
      { slug: 'capabilities/login', content: 'LOGIN' },
      { slug: 'top', content: 'TOP' },
    ], '{"m":1}');

    const caps = fake.children.get('capabilities') as FakeDir;
    expect((caps.children.get('login.md') as FakeFile).content).toBe('LOGIN');
    expect((fake.children.get('top.md') as FakeFile).content).toBe('TOP');
    expect((fake.children.get('block-manifest.json') as FakeFile).content).toBe('{"m":1}');
  });
});
