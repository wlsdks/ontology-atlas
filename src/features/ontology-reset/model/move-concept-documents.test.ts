import { describe, expect, it } from 'vitest';

import { conceptDocumentPaths } from './concept-documents';
import {
  moveConceptDocuments,
  removedFolderPath,
  resetStamp,
  restoreConceptDocuments,
} from './move-concept-documents';

/** An in-memory directory handle with the calls the reset makes; `failWrite` rejects one path's write. */
interface MemoryVault {
  root: FileSystemDirectoryHandle;
  files: Map<string, string>;
  calls: string[];
}

function notFound(path: string): DOMException {
  return new DOMException(`Not found: ${path}`, 'NotFoundError');
}

function memoryVault(
  seed: Record<string, string>,
  options: { failWrite?: string } = {},
): MemoryVault {
  const files = new Map(Object.entries(seed));
  const folders = new Set<string>(['']);
  const calls: string[] = [];
  const addFolders = (path: string) => {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i += 1) folders.add(parts.slice(0, i).join('/'));
  };
  for (const path of files.keys()) addFolders(path);
  const join = (base: string, name: string) => (base ? `${base}/${name}` : name);

  const fileHandle = (path: string) =>
    ({
      kind: 'file',
      name: path.split('/').pop(),
      getFile: async () => {
        const text = files.get(path);
        if (text === undefined) throw notFound(path);
        return { arrayBuffer: async () => Uint8Array.from(Buffer.from(text, 'utf8')).buffer } as unknown as File;
      },
      createWritable: async () => {
        let buffer = '';
        return {
          write: async (chunk: ArrayBuffer | string) => {
            if (options.failWrite === path) throw new Error(`write failed: ${path}`);
            buffer += typeof chunk === 'string' ? chunk : Buffer.from(new Uint8Array(chunk)).toString('utf8');
          },
          close: async () => {
            calls.push(`write ${path}`);
            files.set(path, buffer);
          },
        };
      },
    }) as unknown as FileSystemFileHandle;

  const directory = (base: string): FileSystemDirectoryHandle =>
    ({
      kind: 'directory',
      name: base.split('/').pop() ?? '',
      getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
        const path = join(base, name);
        if (!folders.has(path)) {
          if (!options?.create) throw notFound(path);
          folders.add(path);
        }
        return directory(path);
      },
      getFileHandle: async (name: string, options?: { create?: boolean }) => {
        const path = join(base, name);
        if (!files.has(path)) {
          if (!options?.create) throw notFound(path);
          files.set(path, '');
        }
        return fileHandle(path);
      },
      removeEntry: async (name: string) => {
        const path = join(base, name);
        if (!files.delete(path)) throw notFound(path);
        calls.push(`remove ${path}`);
      },
    }) as unknown as FileSystemDirectoryHandle;

  return { root: directory(''), files, calls };
}

const STAMP = '20261117-093005';
const KEPT = `${removedFolderPath(STAMP)}`;

describe('conceptDocumentPaths', () => {
  it('selects authorable-kind documents and leaves README, wiki, sources, planning, dot-folders and kind-less files', () => {
    const doc = (path: string, kind?: string) => ({ path, frontmatter: kind ? { kind } : {} });
    const paths = conceptDocumentPaths([
      doc('project.md', 'project'),
      doc('domains/orders.md', 'domain'),
      doc('capabilities/checkout.md', 'capability'),
      doc('elements/cart.md', 'element'),
      doc('notes/why.md', 'document'),
      doc('README.md', 'vault-readme'),
      doc('AGENTS.md', 'document'),
      doc('wiki/page.md', 'document'),
      doc('sources/paper.md', 'capability'),
      doc('planning/q4.md', 'domain'),
      doc('.claude/skills/x.md', 'capability'),
      doc('domains/.draft/hidden.md', 'domain'),
      doc('notes/plain.md'),
      doc('notes/odd.md', 'meeting'),
    ]);
    expect(paths).toEqual([
      'project.md',
      'domains/orders.md',
      'capabilities/checkout.md',
      'elements/cart.md',
      'notes/why.md',
    ]);
  });
});

describe('resetStamp', () => {
  it('formats the UTC time as YYYYMMDD-HHMMSS', () => {
    expect(resetStamp(new Date(Date.UTC(2026, 10, 17, 9, 30, 5)))).toBe(STAMP);
  });
});

describe('moveConceptDocuments', () => {
  it('writes each copy before removing its original and keeps the text', async () => {
    const vault = memoryVault({ 'project.md': 'P', 'domains/orders.md': 'D' });
    const outcome = await moveConceptDocuments(vault.root, ['project.md', 'domains/orders.md'], STAMP);
    expect(outcome).toEqual({ stamp: STAMP, moved: ['project.md', 'domains/orders.md'], failure: null });
    expect(vault.calls.filter((call) => !call.endsWith('.gitignore'))).toEqual([
      `write ${KEPT}/project.md`,
      'remove project.md',
      `write ${KEPT}/domains/orders.md`,
      'remove domains/orders.md',
    ]);
    expect(vault.files.get(`${KEPT}/domains/orders.md`)).toBe('D');
    expect(vault.files.has('project.md')).toBe(false);
  });

  it('stops at a failed copy write, leaving that original and every later file in place', async () => {
    const vault = memoryVault(
      { 'a.md': 'A', 'b.md': 'B', 'c.md': 'C' },
      { failWrite: `${KEPT}/b.md` },
    );
    const outcome = await moveConceptDocuments(vault.root, ['a.md', 'b.md', 'c.md'], STAMP);
    expect(outcome.moved).toEqual(['a.md']);
    expect(outcome.failure).toBeInstanceOf(Error);
    expect(vault.files.get('b.md')).toBe('B');
    expect(vault.files.get('c.md')).toBe('C');
    expect(vault.files.has(`${KEPT}/c.md`)).toBe(false);
  });
});

describe('restoreConceptDocuments', () => {
  it('moves copies back to their original paths and skips a path that holds a file again', async () => {
    const vault = memoryVault({ 'project.md': 'P', 'domains/orders.md': 'D' });
    const { moved } = await moveConceptDocuments(vault.root, ['project.md', 'domains/orders.md'], STAMP);
    vault.files.set('project.md', 'NEW');

    const outcome = await restoreConceptDocuments(vault.root, moved, STAMP);

    expect(outcome).toEqual({ restored: ['domains/orders.md'], skipped: ['project.md'], failure: null });
    expect(vault.files.get('domains/orders.md')).toBe('D');
    expect(vault.files.has(`${KEPT}/domains/orders.md`)).toBe(false);
    expect(vault.files.get('project.md')).toBe('NEW');
    expect(vault.files.get(`${KEPT}/project.md`)).toBe('P');
  });
});
