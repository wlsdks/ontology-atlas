import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultManifest } from '../model/types';

/**
 * The pooled read finishes files out of order; the manifest must still equal a serial read's,
 * byte for byte. Stamps stand in for the app's native call, so images and sources stay closed.
 */

const nativeVaultFingerprint = vi.fn();
vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  nativeVaultFingerprint: (rootPath: string) => nativeVaultFingerprint(rootPath),
}));

const { buildLocalManifest } = await import('./build-local-manifest');

interface FakeFile {
  text: string;
  lastModified: number;
  size: number;
}

/** A deterministic shuffle of completion order: each read yields a varying number of turns. */
async function yieldTurns(seed: number) {
  for (let i = 0; i < seed % 7; i += 1) await Promise.resolve();
}

function makeRoot(
  files: Map<string, FakeFile>,
  opens: string[],
  rootPath?: string,
): FileSystemDirectoryHandle {
  interface Dir {
    dirs: Map<string, Dir>;
    files: Map<string, string>;
  }
  const top: Dir = { dirs: new Map(), files: new Map() };
  for (const path of files.keys()) {
    const parts = path.split('/');
    let dir = top;
    for (const part of parts.slice(0, -1)) {
      let child = dir.dirs.get(part);
      if (!child) {
        child = { dirs: new Map(), files: new Map() };
        dir.dirs.set(part, child);
      }
      dir = child;
    }
    dir.files.set(parts[parts.length - 1], path);
  }
  let turn = 0;
  const fileHandle = (name: string, path: string) =>
    ({
      kind: 'file',
      name,
      getFile: async () => {
        opens.push(path);
        const file = files.get(path)!;
        await yieldTurns((turn += 3));
        return {
          lastModified: file.lastModified,
          size: file.size,
          text: async () => {
            await yieldTurns((turn += 5));
            return file.text;
          },
        } as unknown as File;
      },
    }) as unknown as FileSystemFileHandle;
  const dirHandle = (name: string, dir: Dir): FileSystemDirectoryHandle =>
    ({
      kind: 'directory',
      name,
      entries: async function* () {
        for (const [fileName, path] of dir.files) yield [fileName, fileHandle(fileName, path)] as const;
        for (const [dirName, sub] of dir.dirs) yield [dirName, dirHandle(dirName, sub)] as const;
      },
    }) as unknown as FileSystemDirectoryHandle;
  const root = dirHandle('OrderVault', top) as unknown as Record<string, unknown>;
  if (rootPath) root.rootPath = rootPath;
  return root as unknown as FileSystemDirectoryHandle;
}

function note(slug: string, i: number) {
  const links = [`[[elements/e-${(i * 7) % 1500}]]`, `[[guides/g${i % 5}/doc-${(i * 3) % 400}]]`];
  return [
    '---',
    `kind: ${i % 3 === 0 ? 'capability' : 'element'}`,
    `title: 문서 ${slug}`,
    `display_ko: 표시 ${i}`,
    `tags: [t${i % 11}, shared]`,
    '---',
    '',
    `# Heading ${i}`,
    '',
    `Body of ${slug} links ${links.join(' and ')}.`,
    '',
    `## Section ${i % 4}`,
    '',
    `More text ${'word '.repeat(i % 40)}`,
  ].join('\n');
}

/** 2,000 files: 1,500 in one flat folder, 400 nested notes, 60 images, 40 sources. */
function makeVault(): Map<string, FakeFile> {
  const files = new Map<string, FakeFile>();
  const add = (path: string, text: string, i: number) =>
    files.set(path, { text, lastModified: 1_700_000_000_000 + i * 1000, size: text.length + 10 });
  let i = 0;
  for (let n = 0; n < 1500; n += 1, i += 1) add(`elements/e-${n}.md`, note(`elements/e-${n}`, i), i);
  for (let n = 0; n < 400; n += 1, i += 1) {
    const slug = `guides/g${n % 5}/${n % 2 ? 'deep/' : ''}doc-${n}`;
    add(`${slug}.md`, note(slug, i), i);
  }
  for (let n = 0; n < 60; n += 1, i += 1) add(`assets/img-${n}.png`, 'PNG', i);
  for (let n = 0; n < 40; n += 1, i += 1) add(`sources/src-${n}.md`, `source ${n}`, i);
  return files;
}

function stampsFor(files: Map<string, FakeFile>) {
  return {
    entries: [...files].map(([relativePath, f]) => ({
      relativePath,
      lastModified: f.lastModified,
      size: f.size,
    })),
    truncated: false,
    prunedDirs: [],
  };
}

function serialize(manifest: VaultManifest): string {
  const { generatedAt: _ignored, ...rest } = manifest;
  void _ignored;
  return JSON.stringify(rest);
}

beforeEach(() => {
  nativeVaultFingerprint.mockReset();
});

describe('pooled manifest build', () => {
  it('equals the serial build byte for byte on a 2,000-file vault', async () => {
    const files = makeVault();
    nativeVaultFingerprint.mockResolvedValue(null);
    const serial = await buildLocalManifest(makeRoot(files, []), 1);
    const pooled = await buildLocalManifest(makeRoot(files, []));

    expect(serial.manifest.docs.length, 'the fixture built no docs, so equality proves nothing').toBe(
      1900,
    );
    expect(serial.manifest.sources?.length).toBe(40);
    expect(serialize(pooled.manifest)).toBe(serialize(serial.manifest));
    expect(pooled.fingerprint).toBe(serial.fingerprint);
    expect([...pooled.imageHandles.keys()]).toEqual([...serial.imageHandles.keys()]);
    expect([...pooled.sourceHandles.keys()]).toEqual([...serial.sourceHandles.keys()]);
  });

  it('opens no image or source when native stamps exist', async () => {
    const files = makeVault();
    nativeVaultFingerprint.mockResolvedValue(stampsFor(files));
    const opens: string[] = [];
    const built = await buildLocalManifest(makeRoot(files, opens, '/vault'));

    expect(built.imageHandles.size).toBe(60);
    expect(opens.length, 'every note is still read').toBe(1900);
    expect(opens.filter((path) => !path.endsWith('.md') || path.startsWith('sources/'))).toEqual([]);
  });

  it('reads images for their mtime when no native stamps exist (web)', async () => {
    const files = makeVault();
    nativeVaultFingerprint.mockResolvedValue(null);
    const opens: string[] = [];
    await buildLocalManifest(makeRoot(files, opens));
    expect(opens.filter((path) => path.endsWith('.png')).length).toBe(60);
  });

  it('rejects the whole build when one read fails, as the serial read did', async () => {
    const files = makeVault();
    nativeVaultFingerprint.mockResolvedValue(null);
    const root = makeRoot(files, []);
    const broken = files.get('elements/e-700.md')!;
    Object.defineProperty(broken, 'text', {
      get() {
        throw new Error('unreadable');
      },
    });
    await expect(buildLocalManifest(root)).rejects.toThrow('unreadable');
  });

  it('inserts 20,000 children of one folder with a linear number of child searches', async () => {
    const count = 20_000;
    const files = new Map<string, FakeFile>();
    for (let n = 0; n < count; n += 1) {
      files.set(`flat/n-${n}.md`, { text: `# N ${n}\n`, lastModified: n, size: 8 });
    }
    nativeVaultFingerprint.mockResolvedValue(null);
    const root = makeRoot(files, []);
    /* Counts the elements every `find` could scan during the build: a linear child search per
     * insert made this ~count²/2 (200 million here); an index keeps it independent of the folder. */
    let scanned = 0;
    const find = Array.prototype.find;
    const spy = vi.spyOn(Array.prototype, 'find').mockImplementation(function (
      this: unknown[],
      ...args: Parameters<typeof find>
    ) {
      scanned += this.length;
      return find.apply(this, args);
    });
    try {
      const built = await buildLocalManifest(root);
      expect(built.manifest.docs.length).toBe(count);
    } finally {
      spy.mockRestore();
    }
    expect(scanned).toBeLessThan(count * 10);
  });
});
