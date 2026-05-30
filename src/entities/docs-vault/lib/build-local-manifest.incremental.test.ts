import { describe, expect, it } from 'vitest';
import {
  buildLocalManifest,
  buildLocalManifestWithEntries,
  rebuildLocalManifestIncremental,
} from './build-local-manifest';
import type { VaultManifest } from '../model/types';

/**
 * 증분 재빌드(incremental rebuild) 정합성 — charter #1(B 실시간 성능)의 핵심.
 *
 * 라이브 vault 는 변경마다 `load` → 전체 `buildLocalManifest`(모든 .md 의
 * 본문을 다시 읽고 파싱)를 돈다. 큰 vault 에서 에이전트가 파일 하나만 고쳐도
 * 수백 파일을 재독해 → 렉. 증분 경로는 **변경된 파일만** 재독하고 나머지는
 * 직전 빌드 결과를 재사용한다.
 *
 * 안전 계약: 같은 vault 상태에 대해 `rebuildLocalManifestIncremental` 의 결과
 * manifest 는 전체 `buildLocalManifest` 와 **byte-identical**(generatedAt 제외)
 * 이어야 한다. add/change/remove/no-op 모든 변경 조합에서. 이 동치성이 증분
 * 경로의 정확성을 구조적으로 보증한다.
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
 * 중첩 디렉터리 인지 mock root. `reads` 를 넘기면 각 파일의 `.text()` 호출
 * 횟수를 path 별로 집계 — 증분 경로가 변경 파일만 재독하는지 검증용.
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

/** generatedAt 은 비결정적(new Date) — 동치 비교에서 제외. */
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
    // caps/x 삭제 → domains/a 의 backlink(역참조) 가 사라져야 함.
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

    // 변경된 파일만 .text() 호출, 나머지는 0 — I/O 절감의 핵심.
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
