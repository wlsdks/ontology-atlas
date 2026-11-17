import { describe, expect, it, vi } from 'vitest';
import { createPlanningHomeDocument, openPlanningHomeDocument, planningIdentity, savePlanningHomeDocument, scanPlanningHome } from './home-source';

type Tree = { [name: string]: string | Tree };

/** An in-memory folder answering the File System Access calls the home source makes. */
function folder(tree: Tree): FileSystemDirectoryHandle {
  const file = (name: string, parent: Tree): FileSystemFileHandle => ({
    kind: 'file', name,
    getFile: async () => new File([parent[name] as string], name),
    createWritable: async () => {
      let text = '';
      return { write: async (chunk: string) => { text += chunk; }, close: async () => { parent[name] = text; } };
    },
  }) as unknown as FileSystemFileHandle;
  return {
    kind: 'directory',
    entries: async function* () {
      for (const [name, value] of Object.entries(tree)) yield [name, typeof value === 'string' ? file(name, tree) : folder(value)];
    },
    getDirectoryHandle: async (name: string) => {
      const value = tree[name];
      if (typeof value !== 'object') throw new DOMException(name, 'NotFoundError');
      return folder(value);
    },
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      if (typeof tree[name] !== 'string') {
        if (!options?.create) throw new DOMException(name, 'NotFoundError');
        tree[name] = '';
      }
      return file(name, tree);
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe('the home planning source', () => {
  it('lists supported files in path order and skips hidden, pruned, secret-named image and unsupported entries', async () => {
    const inventory = await scanPlanningHome(folder({
      'b.md': '', 'a.png': '', '.draft.md': '', 'api-token.md': '', 'password-flow.png': '', 'notes.txt': '',
      node_modules: { 'x.md': '' }, research: { 'z.md': '', '.git': { 'y.md': '' } }, secrets: { 'plan.md': '' },
    }));
    expect(inventory.files.map((entry) => entry.path)).toEqual(['a.png', 'api-token.md', 'b.md', 'research/z.md', 'secrets/plan.md']);
    expect(inventory.omitted).toMatchObject({ excluded: 4, unsupported: 1 });
    expect(inventory.skipped).toBe(5);
    expect(inventory.partial).toBe(false);
  });

  it('reports a folder deeper than twelve levels as partial and depth limited', async () => {
    let tree: Tree = { 'deep.md': '' };
    for (let level = 0; level < 13; level++) tree = { [`level-${level}`]: tree };
    const inventory = await scanPlanningHome(folder(tree));
    expect(inventory.files).toEqual([]);
    expect(inventory).toMatchObject({ partial: true, depth_limited: true, unknown_remainder: true });
  });

  it('fails instead of reporting an empty folder when the home folder itself cannot be listed', async () => {
    const gone = { kind: 'directory', entries: async function* () { yield* []; throw new DOMException('gone', 'NotFoundError'); } } as unknown as FileSystemDirectoryHandle;
    await expect(scanPlanningHome(gone)).rejects.toThrow();
  });

  it('identifies a document by the first 32 hex characters of its SHA-256', async () => {
    const opened = await openPlanningHomeDocument(folder({ 'plan.md': 'abc' }), 'plan.md', null);
    expect(opened.identity).toBe('ba7816bf8f01cfea414140de5dae2223');
    expect(new TextDecoder().decode(opened.bytes)).toBe('abc');
  });

  it('refuses to open a document whose bytes no longer match the expected identity', async () => {
    await expect(openPlanningHomeDocument(folder({ 'plan.md': 'changed' }), 'plan.md', 'ba7816bf8f01cfea414140de5dae2223')).rejects.toThrow('file-changed');
  });

  it('refuses a path that climbs out of the home folder', async () => {
    await expect(openPlanningHomeDocument(folder({ 'plan.md': '' }), '../plan.md', null)).rejects.toThrow('unsafe-path');
  });

  it('refuses a file over 16 MiB from its size, before reading its bytes', async () => {
    const arrayBuffer = vi.fn();
    const huge = { kind: 'directory', getFileHandle: async () => ({ getFile: async () => ({ size: 16 * 1024 * 1024 + 1, arrayBuffer }) }) } as unknown as FileSystemDirectoryHandle;
    await expect(openPlanningHomeDocument(huge, 'plan.md', null)).rejects.toThrow('file-too-large');
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('saves only while the file on disk still matches the identity the editor opened', async () => {
    const tree: Tree = { 'plan.md': 'abc' };
    const opened = await planningIdentity(new TextEncoder().encode('abc'));
    tree['plan.md'] = 'edited elsewhere';
    await expect(savePlanningHomeDocument(folder(tree), 'plan.md', 'mine', opened)).rejects.toThrow('file-changed');
    expect(tree['plan.md']).toBe('edited elsewhere');
    tree['plan.md'] = 'abc';
    await savePlanningHomeDocument(folder(tree), 'plan.md', 'mine', opened);
    expect(tree['plan.md']).toBe('mine');
  });

  it('creates a titled document beside an existing one without overwriting it', async () => {
    const tree: Tree = { 'Checkout-redesign.md': 'kept' };
    const created = await createPlanningHomeDocument(folder(tree), 'Checkout redesign');
    expect(created.path).toBe('Checkout-redesign-2.md');
    expect(tree['Checkout-redesign.md']).toBe('kept');
    expect(tree['Checkout-redesign-2.md']).toBe('# Checkout redesign\n\n');
  });

  it.each(['Design tokens', 'API key rotation', 'Password reset flow'])('lists, opens and saves a document titled %s', async (title) => {
    const tree: Tree = {};
    const home = folder(tree);
    const created = await createPlanningHomeDocument(home, title);
    expect((await scanPlanningHome(home)).files.map((entry) => entry.path)).toEqual([created.path]);
    const opened = await openPlanningHomeDocument(home, created.path, null);
    await savePlanningHomeDocument(home, created.path, `${created.text}body`, opened.identity);
    expect(tree[created.path]).toBe(`${created.text}body`);
  });

  it('gives a new title a free name when its twin is stored decomposed, leaving the twin untouched', async () => {
    const decomposed = `${'결제'.normalize('NFD')}.md`;
    const tree: Tree = { [decomposed]: 'original body' };
    const created = await createPlanningHomeDocument(folder(tree), '결제');
    expect(created.path).toBe(`${'결제'.normalize('NFC')}-2.md`);
    expect(tree[decomposed]).toBe('original body');
  });

  it('refuses to write a heading over a file that already holds the chosen name', async () => {
    const tree: Tree = { 'Plan.md': 'kept' };
    const home = folder(tree);
    const listing = { ...home, entries: async function* () { yield* []; } } as unknown as FileSystemDirectoryHandle;
    await expect(createPlanningHomeDocument(listing, 'Plan')).rejects.toThrow('name-taken');
    expect(tree['Plan.md']).toBe('kept');
  });
});
