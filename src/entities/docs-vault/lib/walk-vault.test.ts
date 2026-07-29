import { describe, expect, it } from 'vitest';

import {
  VAULT_WALK_MAX_DEPTH,
  VAULT_WALK_MAX_ENTRIES,
  walkVault,
} from './build-local-manifest';

/**
 * 볼트 순회의 **경계** — 2026-07-29 실측 회귀.
 *
 * 설치 앱에서 볼트로 저장소 루트를 고르면 WebView 가 죽었다. 순회가 무제한이라
 * `src-tauri/target` 까지 내려가 디렉터리 984개 · 마크다운 965개(9.4MB)를 IPC 로
 * 실어 날랐다 — 정상 볼트(23 · 97)의 16배다.
 *
 * **ms 가 아니라 횟수로 잠근다.** 성능 예산은 기계마다 달라 플레이크가 되지만
 * "캐시 디렉터리는 한 번도 안 들어간다" 는 어느 기계에서나 참이다.
 */

type Entry = readonly [string, FakeFile | FakeDir];

class FakeFile {
  readonly kind = 'file' as const;
  constructor(readonly name: string) {}
}

class FakeDir {
  readonly kind = 'directory' as const;
  /** 이 디렉터리 안으로 실제로 들어갔는가 — 프룬 증명의 핵심. */
  visited = false;
  constructor(
    readonly name: string,
    private readonly children: Entry[],
  ) {}
  async *entries(): AsyncGenerator<Entry> {
    this.visited = true;
    for (const child of this.children) yield child;
  }
  async getFileHandle(name: string): Promise<FakeFile> {
    const hit = this.children.find(([childName]) => childName === name);
    if (!hit || hit[1].kind !== 'file') throw new Error('NotFoundError');
    return hit[1];
  }
}

function dir(name: string, children: Array<FakeFile | FakeDir>): FakeDir {
  return new FakeDir(
    name,
    children.map((child) => [child.name, child] as Entry),
  );
}
const file = (name: string) => new FakeFile(name);

const run = (root: FakeDir) => walkVault(root as unknown as FileSystemDirectoryHandle);

describe('walkVault — 경계', () => {
  it('collects markdown and images from an ordinary vault', async () => {
    const result = await run(
      dir('vault', [file('a.md'), file('cover.png'), file('notes.txt'), dir('sub', [file('b.md')])]),
    );
    expect(result.entries.map((e) => e.relativePath).sort()).toEqual([
      'a.md',
      'cover.png',
      'sub/b.md',
    ]);
    expect(result.truncated).toBe(false);
    expect(result.prunedDirs).toEqual([]);
  });

  /**
   * `CACHEDIR.TAG` 는 캐시 디렉터리의 **공개 규약**이다 — 디렉터리가 스스로
   * "나는 캐시다" 라고 선언한다(Cargo 가 `target/` 에 쓴다). 이름 목록과 달리
   * 관리할 것이 없고 오탐이 원리적으로 없다.
   */
  it('never descends into a directory that declares itself a cache', async () => {
    const target = dir('target', [file('CACHEDIR.TAG'), file('vendored.md')]);
    const result = await run(dir('repo', [file('README.md'), target]));

    // 표식은 **그 디렉터리의 목록 안에** 있으므로 한 번은 목록을 받는다 —
    // 그러나 그 안의 어떤 항목도 수집되지 않고 하위로도 내려가지 않는다.
    expect(result.entries.map((e) => e.relativePath)).toEqual(['README.md']);
    expect(result.prunedDirs).toEqual(['target']);
  });

  it('never descends into node_modules', async () => {
    const deps = dir('node_modules', [file('readme.md')]);
    const result = await run(dir('repo', [file('a.md'), deps]));

    expect(deps.visited).toBe(false);
    expect(result.prunedDirs).toEqual(['node_modules']);
  });

  /**
   * 이름으로 자르는 목록을 **늘리지 않는다.** `build`·`dist`·`out` 같은 이름은
   * 문서 폴더에도 정당하게 존재할 수 있고, 이름으로 자르면 남의 문서를 조용히
   * 버린다 — 크래시를 고치려다 데이터를 잃는 쪽이 더 나쁘다.
   */
  it('keeps ordinary folders whose names merely look like build output', async () => {
    const build = dir('build', [file('process.md')]);
    const result = await run(dir('vault', [build]));

    expect(build.visited).toBe(true);
    expect(result.entries.map((e) => e.relativePath)).toEqual(['build/process.md']);
    expect(result.prunedDirs).toEqual([]);
  });

  it('stops at the entry cap and says it stopped', async () => {
    const many = Array.from({ length: VAULT_WALK_MAX_ENTRIES + 50 }, (_, i) => file(`n${i}.md`));
    const result = await run(dir('vault', many));

    expect(result.entries.length).toBeLessThanOrEqual(VAULT_WALK_MAX_ENTRIES);
    // **침묵하는 절단은 "전부 봤다" 로 읽힌다.**
    expect(result.truncated).toBe(true);
  });

  it('stops at the depth cap and says it stopped', async () => {
    let deepest = dir('leaf', [file('deep.md')]);
    for (let i = 0; i < VAULT_WALK_MAX_DEPTH + 2; i += 1) {
      deepest = dir(`d${i}`, [deepest]);
    }
    const result = await run(deepest);

    expect(result.truncated).toBe(true);
  });
});
