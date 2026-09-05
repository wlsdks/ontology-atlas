import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  VAULT_SOURCES_DIR,
  VAULT_WALK_MAX_DEPTH,
  VAULT_WALK_MAX_ENTRIES,
  isVaultSourcePath,
} from '@/entities/docs-vault/lib/build-local-manifest';

const repoRoot = resolve(__dirname, '../..');
const rustSource = readFileSync(resolve(repoRoot, 'src-tauri/src/lib.rs'), 'utf8');
const tsSource = readFileSync(
  resolve(repoRoot, 'src/entities/docs-vault/lib/build-local-manifest.ts'),
  'utf8',
);

/**
 * **The two walkers must use the same rules.**
 *
 * Adding `vault_fingerprint` (Rust) on 2026-07-31 made two places walk the vault: TS's
 * `walk()` (web and the real build) and Rust's `walk_vault_stamps` (the app's
 * fingerprint). If they do not count the same file set **the fingerprint differs**, and
 * the defect appears as:
 *
 * - Rust counting more → nothing changed, yet the app **rebuilds everything every time**
 * - Rust counting fewer → a file changed and **it goes unnoticed**
 *
 * Both are quiet: no error on screen, and types and lint pass. So the **rule constants**
 * of the two sources are compared directly here — editing only one breaks this first.
 *
 * ⚠️ This gate only checks that the constants **match**. It cannot catch the walk
 * logic itself diverging — that requires comparing both fingerprints over the same
 * vault in the installed app, which belongs to desktop measurement
 * (`.claude/rules/surfaces.md`).
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
   * Image extensions are a regex in TS and a list in Rust, so the strings cannot be
   * compared. Each side's **set** is extracted and compared instead.
   */
  it('이미지 확장자 집합이 같다', () => {
    const tsMatch = /IMAGE_EXT = \/\\\.\(([^)]+)\)\$\/i/.exec(tsSource);
    expect(tsMatch, 'TS 쪽 IMAGE_EXT 를 못 읽었다 — 정규식 모양이 바뀌었나').toBeTruthy();
    // `png|jpe?g|gif|…` → the extension set. `jpe?g` covers both jpg and jpeg.
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

  /**
   * The library folder is the one place the two walks keep a file the parser will never
   * open. If only one side kept it, dropping a PDF into `sources/` would change the
   * fingerprint on one surface and not the other — the list would refresh in the app and
   * sit still on the web, or the reverse.
   */
  it('the sources folder is named identically on both sides', () => {
    expect(VAULT_SOURCES_DIR).toBe('sources');
    expect(tsSource).toMatch(/export const VAULT_SOURCES_DIR = 'sources';/);
    expect(rustSource).toMatch(/const VAULT_SOURCES_DIR: &str = "sources";/);
  });

  it('both walks anchor the sources prefix at the vault root', () => {
    // `notes/sources/a.pdf` must stay an ignored file on both sides.
    expect(isVaultSourcePath('sources/a.pdf')).toBe(true);
    expect(isVaultSourcePath('notes/sources/a.pdf')).toBe(false);
    expect(rustSource).toMatch(
      /fn vault_relative_is_source[\s\S]*?strip_prefix\(VAULT_SOURCES_DIR\)[\s\S]*?starts_with\('\/'\)/,
    );
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

  /**
   * The size rides along with the mtime for one reason: a raw source is listed by size
   * and never opened. Without it the app would call `getFile()` on every PDF, and under
   * Tauri that is `read_vault_binary_file` — the whole document across IPC for one
   * number, exactly the waste this command exists to remove.
   */
  it('the fingerprint carries a size, and it is still metadata', () => {
    const stamp = /struct VaultStamp \{[\s\S]*?\n\}/.exec(rustSource)?.[0] ?? '';
    expect(stamp).toMatch(/size: u64/);
    expect(tsSource).toMatch(/bytes: stamp\.size/);
  });
});
