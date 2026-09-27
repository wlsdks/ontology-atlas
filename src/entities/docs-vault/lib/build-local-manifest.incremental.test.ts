import { describe, expect, it } from 'vitest';
import {
  buildLocalManifest,
  buildLocalManifestWithEntries,
  rebuildLocalManifestIncremental,
} from './build-local-manifest';
import type { VaultManifest } from '../model/types';

/**
 * `rebuildLocalManifestIncremental` must equal a full `buildLocalManifest` except `generatedAt`
 * across add, change, remove, no-op and rename, while rereading only changed files.
 */

interface FakeFile {
  text: string;
  lastModified: number;
}

function makeFileHandle(
  name: string,
  file: FakeFile,
  reads?: Map<string, number>,
  path?: string,
): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () =>
      ({
        text: async () => {
          if (reads && path) reads.set(path, (reads.get(path) ?? 0) + 1);
          return file.text;
        },
        lastModified: file.lastModified,
      }) as unknown as File,
  } as unknown as FileSystemFileHandle;
}

/** Nested-directory mock root; `reads` tallies `.text()` calls per path. */
function makeRoot(
  files: Record<string, FakeFile>,
  reads?: Map<string, number>,
): FileSystemDirectoryHandle {
  const groups: Record<string, Record<string, FakeFile>> = {};
  for (const [path, file] of Object.entries(files)) {
    const parts = path.split('/');
    const dir = parts.slice(0, -1).join('/');
    const name = parts[parts.length - 1];
    if (!groups[dir]) groups[dir] = {};
    groups[dir][name] = file;
  }

  const buildHandle = (dirKey: string): FileSystemDirectoryHandle => {
    const myFiles = groups[dirKey] ?? {};
    const subDirs = new Set<string>();
    for (const k of Object.keys(groups)) {
      if (k === dirKey) continue;
      if (dirKey === '' && !k.includes('/')) subDirs.add(k);
      else if (dirKey !== '' && k.startsWith(dirKey + '/')) {
        const tail = k.slice(dirKey.length + 1);
        if (!tail.includes('/')) subDirs.add(k);
      }
    }
    return {
      kind: 'directory',
      name: dirKey || 'root',
      entries: async function* () {
        for (const [name, file] of Object.entries(myFiles)) {
          const fullPath = dirKey ? `${dirKey}/${name}` : name;
          yield [name, makeFileHandle(name, file, reads, fullPath)] as const;
        }
        for (const sub of subDirs) {
          const subName = sub.includes('/')
            ? sub.slice(sub.lastIndexOf('/') + 1)
            : sub;
          yield [subName, buildHandle(sub)] as const;
        }
      },
    } as unknown as FileSystemDirectoryHandle;
  };

  return buildHandle('');
}

/** `generatedAt` is non-deterministic, so it is left out of equality. */
function stripGenerated(manifest: VaultManifest) {
  const { generatedAt: _ignored, ...rest } = manifest;
  void _ignored;
  return rest;
}

function handleKeys(map: Map<string, FileSystemFileHandle>): string[] {
  return [...map.keys()].sort();
}

const BASE: Record<string, FakeFile> = {
  'project.md': {
    text: ['---', 'title: Proj', 'tags: [root]', '---', '# Proj', '[[domains/a]] 를 본다.'].join(
      '\n',
    ),
    lastModified: 1000,
  },
  'domains/a.md': {
    text: ['---', 'title: Domain A', 'tags: [d]', '---', '# Domain A', '[[caps/x]] 포함.'].join(
      '\n',
    ),
    lastModified: 2000,
  },
  'caps/x.md': {
    text: ['---', 'title: Cap X', '---', '# Cap X', '본문 [[domains/a]] 역참조.'].join('\n'),
    lastModified: 3000,
  },
};

describe('rebuildLocalManifestIncremental equivalence', () => {
  /** Walk counters must survive the incremental path; the first-run card reads `sourceFileCount`. */
  it('matches a full rebuild in a folder with source files', async () => {
    const withCode = {
      ...BASE,
      'src/editor.ts': { text: "export const editor = 'x';", lastModified: 3000 },
      'src/sync.ts': { text: "export const sync = 'y';", lastModified: 3000 },
      'src/export.ts': { text: "export const exporter = 'z';", lastModified: 3000 },
    };
    const before = await buildLocalManifestWithEntries(makeRoot(withCode));
    expect(before.build.manifest.sourceFileCount).toBe(3);

    const next = {
      ...withCode,
      'caps/x.md': {
        text: ['---', 'title: Cap X 변경', '---', '# Cap X 변경'].join('\n'),
        lastModified: 4000,
      },
    };
    const incremental = await rebuildLocalManifestIncremental(makeRoot(next), before.entries);
    const full = await buildLocalManifest(makeRoot(next));

    expect(incremental.build.manifest.sourceFileCount).toBe(3);
    expect(stripGenerated(incremental.build.manifest)).toEqual(stripGenerated(full.manifest));
  });

  it('omits source values when a folder has no source files', async () => {
    const built = await buildLocalManifestWithEntries(makeRoot(BASE));
    expect(built.build.manifest.sourceFileCount).toBeUndefined();
    const incremental = await rebuildLocalManifestIncremental(makeRoot(BASE), built.entries);
    expect(incremental.build.manifest.sourceFileCount).toBeUndefined();
  });

  it('matches a full rebuild after one body changes', async () => {
    const before = await buildLocalManifestWithEntries(makeRoot(BASE));
    const next = {
      ...BASE,
      'caps/x.md': {
        text: ['---', 'title: Cap X 변경', '---', '# Cap X 변경', '새 본문 [[project]] 참조.'].join(
          '\n',
        ),
        lastModified: 3500,
      },
    };
    const incremental = await rebuildLocalManifestIncremental(makeRoot(next), before.entries);
    const full = await buildLocalManifest(makeRoot(next));

    expect(stripGenerated(incremental.build.manifest)).toEqual(stripGenerated(full.manifest));
    expect(incremental.build.fingerprint).toBe(full.fingerprint);
    expect(handleKeys(incremental.build.fileHandles)).toEqual(handleKeys(full.fileHandles));
  });

  it('changing Cart Session preserves Coupon Issuing freshness byte-for-byte', async () => {
    const storefront = {
      'capabilities/coupon-issue.md': {
        text: ['---', 'kind: capability', 'title: Coupon Issuing', '---', '# Coupon Issuing'].join(
          '\n',
        ),
        lastModified: 1787500154000,
      },
      'elements/cart-session.md': {
        text: ['---', 'kind: element', 'title: Cart Session', '---', '# Cart Session'].join('\n'),
        lastModified: 1787500154000,
      },
    };
    const before = await buildLocalManifestWithEntries(makeRoot(storefront));
    const next = {
      ...storefront,
      'elements/cart-session.md': {
        text: [
          '---',
          'kind: element',
          'title: Cart Session',
          '---',
          '# Cart Session',
          'External watcher probe.',
        ].join('\n'),
        lastModified: 1787501531417,
      },
    };

    const incremental = await rebuildLocalManifestIncremental(makeRoot(next), before.entries);
    const beforeCoupon = before.build.manifest.docs.find(
      (doc) => doc.slug === 'capabilities/coupon-issue',
    );
    const afterCoupon = incremental.build.manifest.docs.find(
      (doc) => doc.slug === 'capabilities/coupon-issue',
    );
    const afterCart = incremental.build.manifest.docs.find(
      (doc) => doc.slug === 'elements/cart-session',
    );

    expect(beforeCoupon, 'baseline Coupon document must exist').toBeDefined();
    expect(afterCoupon, 'incremental Coupon document must exist').toBeDefined();
    expect(afterCart, 'changed Cart document must exist').toBeDefined();
    expect(beforeCoupon!.mtime).toBe(1787500154000);
    expect(beforeCoupon!.updatedAt).toBe('2026-08-23T15:49:14.000Z');
    expect(afterCoupon?.mtime).toBe(beforeCoupon?.mtime);
    expect(afterCoupon?.updatedAt).toBe(beforeCoupon?.updatedAt);
    expect(afterCart?.mtime).toBe(1787501531417);
    expect(afterCart?.updatedAt).toBe('2026-08-23T16:12:11.417Z');
  });

  it('matches a full rebuild after a file is added', async () => {
    const before = await buildLocalManifestWithEntries(makeRoot(BASE));
    const next = {
      ...BASE,
      'caps/y.md': {
        text: ['---', 'title: Cap Y', 'tags: [new]', '---', '# Cap Y', '[[domains/a]]'].join('\n'),
        lastModified: 4000,
      },
    };
    const incremental = await rebuildLocalManifestIncremental(makeRoot(next), before.entries);
    const full = await buildLocalManifest(makeRoot(next));

    expect(stripGenerated(incremental.build.manifest)).toEqual(stripGenerated(full.manifest));
    expect(incremental.build.fingerprint).toBe(full.fingerprint);
    expect(handleKeys(incremental.build.fileHandles)).toEqual(handleKeys(full.fileHandles));
  });

  it('matches a full rebuild after a file is deleted, including backlinks', async () => {
    const before = await buildLocalManifestWithEntries(makeRoot(BASE));
    const next = { ...BASE };
    delete next['caps/x.md'];
    const incremental = await rebuildLocalManifestIncremental(makeRoot(next), before.entries);
    const full = await buildLocalManifest(makeRoot(next));

    expect(stripGenerated(incremental.build.manifest)).toEqual(stripGenerated(full.manifest));
    expect(incremental.build.fingerprint).toBe(full.fingerprint);
    // Deleting caps/x removes domains/a's backlink.
    expect(incremental.build.manifest.backlinksDetail).toEqual(full.manifest.backlinksDetail);
  });

  it('matches a full rebuild when nothing changed', async () => {
    const before = await buildLocalManifestWithEntries(makeRoot(BASE));
    const incremental = await rebuildLocalManifestIncremental(makeRoot(BASE), before.entries);
    const full = await buildLocalManifest(makeRoot(BASE));

    expect(stripGenerated(incremental.build.manifest)).toEqual(stripGenerated(full.manifest));
    expect(incremental.build.fingerprint).toBe(full.fingerprint);
  });

  it('matches a full rebuild after a rename', async () => {
    const before = await buildLocalManifestWithEntries(makeRoot(BASE));
    const next = { ...BASE };
    delete next['caps/x.md'];
    next['caps/x-renamed.md'] = {
      text: ['---', 'title: Cap X Renamed', '---', '# Cap X Renamed', '[[domains/a]]'].join('\n'),
      lastModified: 5000,
    };
    const incremental = await rebuildLocalManifestIncremental(makeRoot(next), before.entries);
    const full = await buildLocalManifest(makeRoot(next));

    expect(stripGenerated(incremental.build.manifest)).toEqual(stripGenerated(full.manifest));
    expect(incremental.build.fingerprint).toBe(full.fingerprint);
  });
});

describe('rebuildLocalManifestIncremental rereads only changed files', () => {
  it('rereads only the body of the one changed file', async () => {
    const before = await buildLocalManifestWithEntries(makeRoot(BASE));
    const next = {
      ...BASE,
      'domains/a.md': {
        text: ['---', 'title: Domain A 변경', '---', '# Domain A 변경'].join('\n'),
        lastModified: 2500,
      },
    };
    const reads = new Map<string, number>();
    await rebuildLocalManifestIncremental(makeRoot(next, reads), before.entries);

    // Only the changed file calls `.text()`.
    expect(reads.get('domains/a.md')).toBe(1);
    expect(reads.get('project.md') ?? 0).toBe(0);
    expect(reads.get('caps/x.md') ?? 0).toBe(0);
  });

  it('reads every file on a full build', async () => {
    const reads = new Map<string, number>();
    await buildLocalManifest(makeRoot(BASE, reads));
    expect(reads.get('project.md')).toBe(1);
    expect(reads.get('domains/a.md')).toBe(1);
    expect(reads.get('caps/x.md')).toBe(1);
  });
});
