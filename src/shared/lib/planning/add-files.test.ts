import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ pick: vi.fn(), import: vi.fn() }));
vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', () => ({ pickTauriSourceFiles: bridge.pick, importTauriSourceFiles: bridge.import }));

import { addPlanningFilesInBrowser, pickPlanningFiles } from './add-files';

type Tree = { [name: string]: number[] | Tree };
const bytes = (text: string) => [...new TextEncoder().encode(text)];

/** A file-like value; jsdom's `File` mangles bytes made in another realm, so tests carry plain arrays. */
const blob = (name: string, content: number[]) => ({ name, size: content.length, arrayBuffer: async () => new Uint8Array(content).buffer }) as unknown as File;

/** An in-memory folder that stores whatever a writable receives as bytes, so a `File` arrives intact. */
function folder(tree: Tree, options: { failWrite?: boolean } = {}): FileSystemDirectoryHandle {
  const file = (name: string): FileSystemFileHandle => ({
    kind: 'file', name,
    getFile: async () => blob(name, tree[name] as number[]),
    createWritable: async () => {
      const parts: number[] = [];
      return {
        write: async (chunk: Blob | string) => {
          if (options.failWrite) throw new DOMException('disk full', 'QuotaExceededError');
          parts.push(...(typeof chunk === 'string' ? bytes(chunk) : new Uint8Array(await chunk.arrayBuffer())));
        },
        close: async () => { tree[name] = parts; },
        abort: async () => {},
      };
    },
  }) as unknown as FileSystemFileHandle;
  return {
    kind: 'directory',
    entries: async function* () {
      for (const [name, value] of Object.entries(tree)) yield [name, Array.isArray(value) ? file(name) : folder(value)];
    },
    getDirectoryHandle: async (name: string) => {
      const value = tree[name];
      if (!value || Array.isArray(value)) throw new DOMException(name, 'NotFoundError');
      return folder(value);
    },
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      const value = tree[name];
      if (value && !Array.isArray(value)) throw new DOMException(name, 'TypeMismatchError');
      if (!value) {
        if (!options?.create) throw new DOMException(name, 'NotFoundError');
        tree[name] = [];
      }
      return file(name);
    },
    removeEntry: async (name: string) => {
      if (!(name in tree)) throw new DOMException(name, 'NotFoundError');
      delete tree[name];
    },
  } as unknown as FileSystemDirectoryHandle;
}

const picked = (name: string, content: string | number[]) => blob(name, typeof content === 'string' ? bytes(content) : content);

describe('adding files to the home planning folder in the browser', () => {
  it('gives a taken name a suffix, ignoring case and Unicode composition, and overwrites nothing', async () => {
    const tree: Tree = { 'Brief.md': bytes('# Theirs\n'), 'café.png': bytes('PNG-theirs'), 'brief (2).md': bytes('# Also theirs\n') };
    const outcome = await addPlanningFilesInBrowser(folder(tree), [picked('brief.md', '# Mine\n'), picked('café.png', 'PNG-mine')]);
    expect(outcome).toEqual({ added: ['brief (3).md', 'café (2).png'], duplicates: 0, unsupported: 0, failed: 0 });
    expect(tree['Brief.md']).toEqual(bytes('# Theirs\n'));
    expect(tree['brief (2).md']).toEqual(bytes('# Also theirs\n'));
    expect(tree['café.png']).toEqual(bytes('PNG-theirs'));
    expect(tree['brief (3).md']).toEqual(bytes('# Mine\n'));
  });

  it('writes the picked bytes themselves, not decoded text', async () => {
    const tree: Tree = {};
    const image = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00, 0xfe];
    await addPlanningFilesInBrowser(folder(tree), [picked('wire.png', image)]);
    expect(tree['wire.png']).toEqual(image);
  });

  it('does not copy bytes that are already anywhere in the folder, nor the same pick twice', async () => {
    const tree: Tree = { research: { 'old.png': bytes('PNG-same') } };
    const outcome = await addPlanningFilesInBrowser(folder(tree), [picked('again.png', 'PNG-same'), picked('new.md', '# New\n'), picked('new copy.md', '# New\n')]);
    expect(outcome).toEqual({ added: ['new.md'], duplicates: 2, unsupported: 0, failed: 0 });
    expect(Object.keys(tree).sort()).toEqual(['new.md', 'research']);
  });

  it('refuses a type the home folder does not list and drops leading dots from the rest', async () => {
    const tree: Tree = {};
    const beforeWrite = vi.fn();
    const outcome = await addPlanningFilesInBrowser(folder(tree), [
      picked('notes.txt', 'x'), picked('deck.pdf', 'x'), picked('api-token.png', 'x'), picked('.md', 'x'), picked('.hidden.md', '# Hidden\n'),
    ], beforeWrite);
    expect(outcome).toEqual({ added: ['hidden.md'], duplicates: 0, unsupported: 4, failed: 0 });
    expect(Object.keys(tree)).toEqual(['hidden.md']);
    expect(beforeWrite).toHaveBeenCalledExactlyOnceWith('hidden.md');
  });

  it('leaves no empty file behind when a copy fails to write', async () => {
    const tree: Tree = { 'brief.md': bytes('# Theirs\n') };
    const outcome = await addPlanningFilesInBrowser(folder(tree, { failWrite: true }), [picked('wire.png', 'PNG'), picked('brief.md', '# Mine\n')]);
    expect(outcome).toEqual({ added: [], duplicates: 0, unsupported: 0, failed: 2 });
    expect(tree).toEqual({ 'brief.md': bytes('# Theirs\n') });
  });

  it('never writes over a folder that holds the chosen name', async () => {
    const tree: Tree = { 'plan.md': {} };
    const outcome = await addPlanningFilesInBrowser(folder(tree), [picked('plan.md', '# Plan\n')]);
    expect(outcome.added).toEqual(['plan (2).md']);
    expect(tree['plan.md']).toEqual({});
  });
});

describe('adding files to the home planning folder in the app', () => {
  beforeEach(() => { bridge.pick.mockReset(); bridge.import.mockReset(); });

  it('sends every picked path unchanged to the planning destination and counts what the app refused by type', async () => {
    const paths = ['C:\\Users\\me\\Downloads\\brief.md', '/Users/me/Downloads/deck.pdf', '/Users/me/Desktop/wire.png', '/Users/me/Desktop/notes.md'];
    bridge.pick.mockResolvedValue(paths);
    bridge.import.mockResolvedValue([
      { pickedName: 'brief.md', status: 'renamed', relativePath: 'planning/brief (2).md', sha256: null, size: null, reason: null },
      { pickedName: 'deck.pdf', status: 'failed', relativePath: null, sha256: null, size: null, reason: 'unsupported-type' },
      { pickedName: 'wire.png', status: 'duplicate', relativePath: 'planning/wire.png', sha256: null, size: null, reason: null },
      { pickedName: 'notes.md', status: 'failed', relativePath: null, sha256: null, size: null, reason: 'source-missing' },
    ]);
    const outcome = await pickPlanningFiles({ directory: folder({}), rootPath: '/Users/me/vault' });
    expect(bridge.import).toHaveBeenCalledWith('/Users/me/vault', paths, 'planning');
    expect(outcome).toEqual({ added: ['brief (2).md'], duplicates: 1, unsupported: 1, failed: 1 });
  });

  it('reads a dismissed native picker as no choice at all', async () => {
    bridge.pick.mockResolvedValue([]);
    expect(await pickPlanningFiles({ directory: folder({}), rootPath: '/Users/me/vault' })).toBeNull();
    expect(bridge.import).not.toHaveBeenCalled();
  });
});
