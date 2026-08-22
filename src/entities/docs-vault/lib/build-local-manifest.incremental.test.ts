import { describe, expect, it } from 'vitest';
import {
  buildLocalManifest,
  buildLocalManifestWithEntries,
  rebuildLocalManifestIncremental,
} from './build-local-manifest';
import type { VaultManifest } from '../model/types';

/**
 * Incremental rebuild consistency.
 *
 * A live vault runs `load` → a full `buildLocalManifest` on every change, re-reading
 * and re-parsing every `.md`. On a large vault an agent editing one file re-reads
 * hundreds, which is the lag. The incremental path re-reads **only changed files**
 * and reuses the previous build for the rest.
 *
 * Safety contract: for the same vault state, `rebuildLocalManifestIncremental` must
 * produce a manifest **byte-identical** to a full `buildLocalManifest` (except
 * `generatedAt`), across add / change / remove / no-op. That equivalence is what
 * makes the incremental path structurally correct.
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

/**
 * Mock root that understands nested directories. Passing `reads` tallies `.text()`
 * calls per path, which is how "only changed files are re-read" is verified.
 */
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

/** `generatedAt` is non-deterministic (new Date) — excluded from the equality check. */
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

describe('rebuildLocalManifestIncremental — 동치성', () => {
  it('파일 하나 본문 변경 시 전체 재빌드와 동일', async () => {
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

  it('파일 추가 시 전체 재빌드와 동일', async () => {
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

  it('파일 삭제 시 전체 재빌드와 동일 (backlinks 도 갱신)', async () => {
    const before = await buildLocalManifestWithEntries(makeRoot(BASE));
    const next = { ...BASE };
    delete next['caps/x.md'];
    const incremental = await rebuildLocalManifestIncremental(makeRoot(next), before.entries);
    const full = await buildLocalManifest(makeRoot(next));

    expect(stripGenerated(incremental.build.manifest)).toEqual(stripGenerated(full.manifest));
    expect(incremental.build.fingerprint).toBe(full.fingerprint);
    // Deleting caps/x must remove domains/a's backlink.
    expect(incremental.build.manifest.backlinksDetail).toEqual(full.manifest.backlinksDetail);
  });

  it('변경 없음(no-op) 시 전체 재빌드와 동일', async () => {
    const before = await buildLocalManifestWithEntries(makeRoot(BASE));
    const incremental = await rebuildLocalManifestIncremental(makeRoot(BASE), before.entries);
    const full = await buildLocalManifest(makeRoot(BASE));

    expect(stripGenerated(incremental.build.manifest)).toEqual(stripGenerated(full.manifest));
    expect(incremental.build.fingerprint).toBe(full.fingerprint);
  });

  it('rename(삭제+추가) 복합 변경 시 전체 재빌드와 동일', async () => {
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

describe('rebuildLocalManifestIncremental — 변경 파일만 재독', () => {
  it('파일 하나만 변경하면 그 파일의 본문만 다시 읽는다', async () => {
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

    // Only the changed file calls `.text()`; the rest are zero — the point of the I/O saving.
    expect(reads.get('domains/a.md')).toBe(1);
    expect(reads.get('project.md') ?? 0).toBe(0);
    expect(reads.get('caps/x.md') ?? 0).toBe(0);
  });

  it('전체 빌드는 모든 파일을 읽는다 (대비 — baseline)', async () => {
    const reads = new Map<string, number>();
    await buildLocalManifest(makeRoot(BASE, reads));
    expect(reads.get('project.md')).toBe(1);
    expect(reads.get('domains/a.md')).toBe(1);
    expect(reads.get('caps/x.md')).toBe(1);
  });
});
