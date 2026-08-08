import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultManifest } from '../model/types';

/**
 * **증분 재빌드가 mtime 을 알아내려고 파일을 열지 않는다.**
 *
 * ## 무엇이 났나 (2026-08-09, 설치된 앱 실측)
 *
 * `rebuildLocalManifestIncremental` 의 존재 이유는 「바뀐 파일만 다시 읽는다」인데,
 * 정작 *무엇이 바뀌었는지* 알아내려고 **파일마다 `getFile()`** 을 불렀다. Tauri
 * 에서 그건 `read_vault_text_file` IPC 왕복이고 그 명령은 **본문 전체를 함께**
 * 돌려준다. 그래서 본문 재파싱은 아꼈지만 전송과 왕복은 하나도 못 아꼈다.
 *
 * 실측 — 파일 하나를 고쳤을 때 앱의 지도가 따라오기까지:
 *
 * | 볼트 | 반영까지 |
 * |---|---|
 * | 71파일 | 2.0초 (1.6초엔 아직) |
 * | 5파일 | 0.7초 |
 *
 * 파일 수에 비례했고 건당 ≈20ms 로 IPC 왕복과 맞았다. 정작 같은 71파일을
 * 디스크에서 읽는 비용은 **1.8ms** 다 — 시간은 일이 아니라 다리에서 갔다.
 *
 * 고친 방법은 새 네이티브 명령이 아니다: 경로와 mtime 만 한 번에 주는
 * `vault_fingerprint` 가 **이미 있고 같은 파일에서 쓰고 있었다.**
 *
 * ## 이 게이트가 잠그는 성질
 *
 * *네이티브 스탬프를 쓸 수 있으면, 바뀌지 않은 파일은 열지 않는다.*
 *
 * ⚠️ **밀리초로 재지 않는다** — 기계마다 달라 들쭉날쭉 실패한다(`architecture.md`
 * 가 이미 정해 둔 규율: 「몇 ms」가 아니라 「몇 번」으로 잠근다). 그래서 여기서
 * 세는 것은 `getFile()` **호출 횟수**이고, 그건 어느 기계에서나 같다.
 */

const nativeVaultFingerprint = vi.fn();
vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  nativeVaultFingerprint: (rootPath: string) => nativeVaultFingerprint(rootPath),
}));

const { buildLocalManifest, buildLocalManifestWithEntries, rebuildLocalManifestIncremental } =
  await import('./build-local-manifest');

interface FakeFile {
  text: string;
  lastModified: number;
}

/** `getFile()` 호출을 경로별로 세는 mock root. */
function makeRoot(
  files: Record<string, FakeFile>,
  opens: Map<string, number>,
  rootPath?: string,
): FileSystemDirectoryHandle {
  const groups: Record<string, Record<string, FakeFile>> = {};
  for (const [p, file] of Object.entries(files)) {
    const parts = p.split('/');
    const dir = parts.slice(0, -1).join('/');
    const name = parts[parts.length - 1];
    if (!groups[dir]) groups[dir] = {};
    groups[dir][name] = file;
  }

  const fileHandle = (name: string, file: FakeFile, fullPath: string) =>
    ({
      kind: 'file',
      name,
      getFile: async () => {
        opens.set(fullPath, (opens.get(fullPath) ?? 0) + 1);
        return {
          text: async () => file.text,
          lastModified: file.lastModified,
        } as unknown as File;
      },
    }) as unknown as FileSystemFileHandle;

  const buildHandle = (dirKey: string): FileSystemDirectoryHandle => {
    const myFiles = groups[dirKey] ?? {};
    const subDirs = new Set<string>();
    for (const k of Object.keys(groups)) {
      if (k === dirKey) continue;
      if (dirKey === '' && !k.includes('/')) subDirs.add(k);
      else if (dirKey !== '' && k.startsWith(`${dirKey}/`)) {
        const tail = k.slice(dirKey.length + 1);
        if (!tail.includes('/')) subDirs.add(k);
      }
    }
    const handle = {
      kind: 'directory',
      name: dirKey || 'root',
      entries: async function* () {
        for (const [name, file] of Object.entries(myFiles)) {
          yield [name, fileHandle(name, file, dirKey ? `${dirKey}/${name}` : name)] as const;
        }
        for (const sub of subDirs) {
          const subName = sub.includes('/') ? sub.slice(sub.lastIndexOf('/') + 1) : sub;
          yield [subName, buildHandle(sub)] as const;
        }
      },
    } as Record<string, unknown>;
    if (dirKey === '' && rootPath) handle.rootPath = rootPath;
    return handle as unknown as FileSystemDirectoryHandle;
  };

  return buildHandle('');
}

function node(slug: string, title: string, body = 'x') {
  return `---\nkind: capability\nslug: ${slug}\ntitle: ${title}\n---\n\n${body}\n`;
}

function stripGenerated(manifest: VaultManifest) {
  const { generatedAt: _ignored, ...rest } = manifest;
  void _ignored;
  return rest;
}

const FILES: Record<string, FakeFile> = {
  'README.md': { text: node('README', 'Readme'), lastModified: 100 },
  'capabilities/a.md': { text: node('capabilities/a', 'A'), lastModified: 200 },
  'capabilities/b.md': { text: node('capabilities/b', 'B'), lastModified: 300 },
  'capabilities/c.md': { text: node('capabilities/c', 'C'), lastModified: 400 },
  'capabilities/d.md': { text: node('capabilities/d', 'D'), lastModified: 500 },
};

const stampsFor = (files: Record<string, FakeFile>) => ({
  entries: Object.entries(files).map(([relativePath, f]) => ({
    relativePath,
    lastModified: f.lastModified,
  })),
  truncated: false,
  prunedDirs: [],
});

beforeEach(() => {
  nativeVaultFingerprint.mockReset();
});

describe('증분 재빌드 — 네이티브 스탬프가 있으면 안 바뀐 파일을 열지 않는다', () => {
  it('한 파일만 바뀌면 그 파일만 연다', async () => {
    // 1차: 전체 빌드로 직전 entries 를 만든다(여기서는 전부 열어야 정상).
    const seedOpens = new Map<string, number>();
    const seed = await buildLocalManifestWithEntries(makeRoot(FILES, seedOpens, '/vault'));
    expect(seedOpens.size, '1차 빌드가 파일을 하나도 안 열었다 — 이 시험이 헛돈다').toBe(5);

    // 2차: b.md 만 mtime 이 바뀐다.
    const changed: Record<string, FakeFile> = {
      ...FILES,
      'capabilities/b.md': { text: node('capabilities/b', 'B2'), lastModified: 999 },
    };
    nativeVaultFingerprint.mockResolvedValue(stampsFor(changed));

    const opens = new Map<string, number>();
    const result = await rebuildLocalManifestIncremental(
      makeRoot(changed, opens, '/vault'),
      seed.entries,
    );

    expect(nativeVaultFingerprint, '네이티브 스탬프를 한 번만 물어야 한다').toHaveBeenCalledTimes(1);
    expect(
      [...opens.keys()],
      '바뀐 파일 하나만 열려야 한다 — 나머지는 mtime 만 보고 재사용',
    ).toEqual(['capabilities/b.md']);

    // 그리고 결과는 전체 빌드와 같아야 한다(증분의 안전 계약).
    const fullOpens = new Map<string, number>();
    const full = await buildLocalManifest(makeRoot(changed, fullOpens, '/vault'));
    expect(stripGenerated(result.build.manifest)).toEqual(stripGenerated(full.manifest));
  });

  it('아무것도 안 바뀌면 파일을 하나도 열지 않는다', async () => {
    const seedOpens = new Map<string, number>();
    const seed = await buildLocalManifestWithEntries(makeRoot(FILES, seedOpens, '/vault'));
    nativeVaultFingerprint.mockResolvedValue(stampsFor(FILES));

    const opens = new Map<string, number>();
    await rebuildLocalManifestIncremental(makeRoot(FILES, opens, '/vault'), seed.entries);
    expect([...opens.keys()], '변경이 없는데 파일을 열었다').toEqual([]);
  });

  it('새로 생긴 파일은 스탬프가 알려 줘도 읽어야 한다 — 직전 결과가 없으니까', async () => {
    const seedOpens = new Map<string, number>();
    const seed = await buildLocalManifestWithEntries(makeRoot(FILES, seedOpens, '/vault'));
    const added: Record<string, FakeFile> = {
      ...FILES,
      'capabilities/e.md': { text: node('capabilities/e', 'E'), lastModified: 600 },
    };
    nativeVaultFingerprint.mockResolvedValue(stampsFor(added));

    const opens = new Map<string, number>();
    await rebuildLocalManifestIncremental(makeRoot(added, opens, '/vault'), seed.entries);
    expect([...opens.keys()]).toEqual(['capabilities/e.md']);
  });

  /**
   * 폴백 — 웹에는 이 일괄 API 가 없다(`null`). 그러면 종전 경로로 떨어져
   * **파일마다 열어** mtime 을 본다. 동작이 달라지지 않는 것이 계약이다.
   */
  it('네이티브가 없으면(웹) 종전대로 파일별로 확인한다', async () => {
    const seedOpens = new Map<string, number>();
    const seed = await buildLocalManifestWithEntries(makeRoot(FILES, seedOpens));
    nativeVaultFingerprint.mockResolvedValue(null);

    const opens = new Map<string, number>();
    await rebuildLocalManifestIncremental(makeRoot(FILES, opens), seed.entries);
    expect(
      opens.size,
      '웹 경로에서는 파일마다 열어 mtime 을 봐야 한다(그것이 종전 동작)',
    ).toBe(5);
  });

  it('네이티브가 던져도 폴백한다 — 조용히 멈추지 않는다', async () => {
    const seedOpens = new Map<string, number>();
    const seed = await buildLocalManifestWithEntries(makeRoot(FILES, seedOpens, '/vault'));
    nativeVaultFingerprint.mockRejectedValue(new Error('bridge down'));

    const opens = new Map<string, number>();
    const result = await rebuildLocalManifestIncremental(
      makeRoot(FILES, opens, '/vault'),
      seed.entries,
    );
    expect(opens.size, '네이티브 실패 시 파일별 경로로 떨어져야 한다').toBe(5);
    expect(result.build.manifest.docs.length).toBe(5);
  });
});
