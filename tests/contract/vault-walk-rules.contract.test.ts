import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  VAULT_WALK_MAX_DEPTH,
  VAULT_WALK_MAX_ENTRIES,
} from '@/entities/docs-vault/lib/build-local-manifest';

const repoRoot = resolve(__dirname, '../..');
const rustSource = readFileSync(resolve(repoRoot, 'src-tauri/src/lib.rs'), 'utf8');
const tsSource = readFileSync(
  resolve(repoRoot, 'src/entities/docs-vault/lib/build-local-manifest.ts'),
  'utf8',
);

/**
 * **두 walker 가 같은 규칙을 써야 한다.**
 *
 * 2026-07-31 에 `vault_fingerprint`(Rust) 를 추가하면서 볼트를 훑는 곳이 둘이
 * 됐다 — TS 의 `walk()`(웹 · 실제 빌드)와 Rust 의 `walk_vault_stamps`(앱의 지문).
 * 둘이 같은 파일 집합을 세지 않으면 **지문이 달라지고**, 그 결함은 이렇게 나온다:
 *
 * - Rust 가 더 많이 세면 → 바뀐 게 없는데 앱이 **매번 전체 재빌드**
 * - Rust 가 덜 세면 → 파일이 바뀌었는데 **안 알아챈다**
 *
 * 둘 다 조용하다. 화면에 에러가 안 뜨고, 타입도 lint 도 통과한다. 그래서 여기서
 * 두 소스의 **규칙 상수**를 직접 맞대어 본다 — 한쪽만 고치면 여기서 먼저 터진다.
 *
 * ⚠️ 이 게이트는 상수의 **일치**만 본다. 순회 로직 자체가 갈라지는 것은 못 잡는다.
 * 그건 설치 앱에서 같은 볼트로 두 지문을 비교해야 알 수 있고, 그 검증은 데스크톱
 * 실측의 몫이다(`surfaces.md`).
 */
describe('볼트 walk 규칙 — TS 와 Rust 가 같아야 한다', () => {
  it('깊이 상한이 같다', () => {
    expect(VAULT_WALK_MAX_DEPTH).toBe(12);
    expect(rustSource).toMatch(/const VAULT_WALK_MAX_DEPTH: usize = 12;/);
  });

  it('항목 수 상한이 같다', () => {
    expect(VAULT_WALK_MAX_ENTRIES).toBe(4000);
    expect(rustSource).toMatch(/const VAULT_WALK_MAX_ENTRIES: usize = 4000;/);
  });

  it('가지치기 디렉터리 목록이 같다', () => {
    expect(tsSource).toMatch(/PRUNE_BY_NAME = new Set\(\['node_modules'\]\)/);
    expect(rustSource).toMatch(/VAULT_PRUNE_DIR_NAMES: &\[&str\] = &\["node_modules"\];/);
  });

  it('캐시 표식 파일명이 같다', () => {
    expect(tsSource).toMatch(/CACHE_DIR_TAG = 'CACHEDIR\.TAG'/);
    expect(rustSource).toMatch(/VAULT_CACHE_DIR_TAG: &str = "CACHEDIR\.TAG";/);
  });

  /**
   * 이미지 확장자는 TS 가 정규식, Rust 가 목록이라 문자열 비교가 안 된다.
   * 그래서 **같은 집합인지**를 각자에서 뽑아 비교한다.
   */
  it('이미지 확장자 집합이 같다', () => {
    const tsMatch = /IMAGE_EXT = \/\\\.\(([^)]+)\)\$\/i/.exec(tsSource);
    expect(tsMatch, 'TS 쪽 IMAGE_EXT 를 못 읽었다 — 정규식 모양이 바뀌었나').toBeTruthy();
    // `png|jpe?g|gif|…` → 확장자 집합. `jpe?g` 는 jpg·jpeg 둘 다다.
    const tsExts = new Set(
      tsMatch![1]!.split('|').flatMap((token) => (token === 'jpe?g' ? ['jpg', 'jpeg'] : [token])),
    );

    const rustMatch = /VAULT_IMAGE_EXTS: &\[&str\] = &\[([^\]]+)\]/.exec(rustSource);
    expect(rustMatch, 'Rust 쪽 VAULT_IMAGE_EXTS 를 못 읽었다').toBeTruthy();
    const rustExts = new Set(
      rustMatch![1]!.split(',').map((s) => s.trim().replace(/"/g, '')).filter(Boolean),
    );

    expect([...rustExts].sort()).toEqual([...tsExts].sort());
  });

  it('숨김 파일(.으로 시작)을 둘 다 건너뛴다', () => {
    expect(tsSource).toMatch(/name\.startsWith\('\.'\)/);
    expect(rustSource).toMatch(/name\.starts_with\('\.'\)/);
  });

  it('Rust 지문은 본문을 담지 않는다 — 그것이 이 명령의 존재 이유다', () => {
    const stamp = /struct VaultStamp \{[\s\S]*?\n\}/.exec(rustSource)?.[0] ?? '';
    expect(stamp).toBeTruthy();
    expect(stamp).toMatch(/relative_path/);
    expect(stamp).toMatch(/last_modified/);
    expect(stamp, '지문에 본문이 들어가면 IPC 절약이 사라진다').not.toMatch(/\btext\b|\bbytes\b/);
  });
});
