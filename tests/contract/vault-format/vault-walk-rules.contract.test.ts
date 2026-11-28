import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  VAULT_SOURCES_DIR,
  VAULT_WALK_MAX_DEPTH,
  VAULT_WALK_MAX_ENTRIES,
  isVaultSourcePath,
} from '@/entities/docs-vault/lib/local-manifest/walk-vault';

const repoRoot = resolve(__dirname, '../../..');
const rustSource = readFileSync(resolve(repoRoot, 'src-tauri/src/vault/walk.rs'), 'utf8');
const serverSlugRules = readFileSync(resolve(repoRoot, 'src-tauri/crates/confined-files/src/slug_rules.rs'), 'utf8');
const tsSource = ['walk-vault.ts', 'build-local-manifest.ts']
  .map((file) => readFileSync(resolve(repoRoot, 'src/entities/docs-vault/lib/local-manifest', file), 'utf8'))
  .join('\n');

/**
 * TS `walk()` and Rust `walk_vault_stamps` must count the same file set, or the fingerprint differs:
 * Rust counting more rebuilds everything every time, counting fewer misses a change. Only the rule
 * constants are compared; walk logic is measured in the installed app (`.claude/rules/surfaces.md`).
 */
describe('vault walk rules: TS and Rust must agree', () => {
  it('the depth cap is the same', () => {
    expect(VAULT_WALK_MAX_DEPTH).toBe(12);
    expect(rustSource).toMatch(/const VAULT_WALK_MAX_DEPTH: usize = 12;/);
  });

  it('keeps the web and native entry ceilings aligned', () => {
    expect(VAULT_WALK_MAX_ENTRIES).toBe(100000);
    const nativeLimit = /const VAULT_WALK_MAX_ENTRIES: usize = (\d+);/.exec(rustSource)?.[1];
    expect(nativeLimit).toBe(String(VAULT_WALK_MAX_ENTRIES));
  });

  it('the pruned directory list is the same', () => {
    expect(tsSource).toMatch(/PRUNE_BY_NAME = new Set\(\['node_modules'\]\)/);
    expect(rustSource).toMatch(/VAULT_PRUNE_DIR_NAMES: &\[&str\] = &\["node_modules"\];/);
  });

  it('the cache marker file name is the same', () => {
    expect(tsSource).toMatch(/CACHE_DIR_TAG = 'CACHEDIR\.TAG'/);
    expect(rustSource).toMatch(/VAULT_CACHE_DIR_TAG: &str = "CACHEDIR\.TAG";/);
  });

  /**
   * Image extensions are a regex in TS and a list in Rust, so the strings cannot be
   * compared. Each side's **set** is extracted and compared instead.
   */
  it('the image extension set is the same', () => {
    const tsMatch = /IMAGE_EXT = \/\\\.\(([^)]+)\)\$\/i/.exec(tsSource);
    expect(tsMatch, 'could not read IMAGE_EXT on the TS side; did the regex shape change').toBeTruthy();
    // `png|jpe?g|gif|…` → the extension set. `jpe?g` covers both jpg and jpeg.
    const tsExts = new Set(
      tsMatch![1]!.split('|').flatMap((token) => (token === 'jpe?g' ? ['jpg', 'jpeg'] : [token])),
    );

    const rustMatch = /VAULT_IMAGE_EXTS: &\[&str\] = &\[([^\]]+)\]/.exec(rustSource);
    expect(rustMatch, 'could not read VAULT_IMAGE_EXTS on the Rust side').toBeTruthy();
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

  it('the MCP server names the sources folder like the app, and the app anchors it at the root', () => {
    expect(serverSlugRules).toMatch(/pub const VAULT_SOURCES_DIR: &str = "sources";/);
    const sourcePaths = Object.fromEntries(
      ['sources/a.pdf', 'sources/notes/a.md', 'notes/sources/a.md', 'sources.md'].map((path) => [path, isVaultSourcePath(path)]),
    );
    expect(sourcePaths).toEqual({
      'sources/a.pdf': true,
      'sources/notes/a.md': true,
      'notes/sources/a.md': false,
      'sources.md': false,
    });
  });

  it('both walks anchor the sources prefix at the vault root', () => {
    // `notes/sources/a.pdf` must stay an ignored file on both sides.
    expect(isVaultSourcePath('sources/a.pdf')).toBe(true);
    expect(isVaultSourcePath('notes/sources/a.pdf')).toBe(false);
    expect(rustSource).toMatch(
      /fn vault_relative_is_source[\s\S]*?strip_prefix\(VAULT_SOURCES_DIR\)[\s\S]*?starts_with\('\/'\)/,
    );
  });

  it('both skip hidden files (starting with .)', () => {
    expect(tsSource).toMatch(/name\.startsWith\('\.'\)/);
    expect(rustSource).toMatch(/name\.starts_with\('\.'\)/);
  });

  it('the Rust fingerprint carries no body, which is the reason this command exists', () => {
    const stamp = /struct VaultStamp \{[\s\S]*?\n\}/.exec(rustSource)?.[0] ?? '';
    expect(stamp).toBeTruthy();
    expect(stamp).toMatch(/relative_path/);
    expect(stamp).toMatch(/last_modified/);
    expect(stamp, 'if the fingerprint carries the body, the IPC saving is gone').not.toMatch(/\btext\b|\bbytes\b/);
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
