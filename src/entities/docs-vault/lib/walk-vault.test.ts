import { describe, expect, it } from 'vitest';

import {
  VAULT_WALK_MAX_DEPTH,
  VAULT_WALK_MAX_ENTRIES,
  walkVault,
} from './build-local-manifest';

/**
 * The vault walk's **boundary** — regression measured 2026-07-29.
 *
 * Choosing the repository root as the vault killed the WebView in the installed app.
 * With no bound the walk descended into `src-tauri/target` and carried 984
 * directories / 965 markdown files (9.4 MB) across IPC — 16× a normal vault (23 / 97).
 *
 * **Locked by count, not milliseconds.** A performance budget varies by machine and
 * becomes a flake; "a cache directory is never entered" is true everywhere.
 */

type Entry = readonly [string, FakeFile | FakeDir];

class FakeFile {
  readonly kind = 'file' as const;
  constructor(readonly name: string) {}
}

class FakeDir {
  readonly kind = 'directory' as const;
  /** Did the walk actually descend into this directory — the proof that pruning works. */
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

  it('normalizes NFD filesystem names to NFC so Hangul slugs match NFC refs', async () => {
    // macOS hands back NFD names; frontmatter refs are NFC. Caught in the
    // 2026-09-01 review: the unnormalized slug matched no ref, the containment
    // edge dangled, and derivation minted a phantom duplicate node.
    const nfdName = '결제.md'.normalize('NFD');
    const nfdDir = '도메인'.normalize('NFD');
    const result = await run(dir('vault', [file(nfdName), dir(nfdDir, [file(nfdName)])]));
    expect(result.entries.map((e) => e.relativePath).sort()).toEqual([
      '결제.md'.normalize('NFC'),
      `${'도메인'.normalize('NFC')}/${'결제.md'.normalize('NFC')}`,
    ]);
  });

  /**
   * `CACHEDIR.TAG` is the **public convention** for cache directories: the directory
   * declares itself (Cargo writes one into `target/`). Unlike a name list there is
   * nothing to maintain and no false positive is possible.
   */
  it('never descends into a directory that declares itself a cache', async () => {
    const target = dir('target', [file('CACHEDIR.TAG'), file('vendored.md')]);
    const result = await run(dir('repo', [file('README.md'), target]));

    // The tag lives **inside that directory's listing**, so the listing is fetched once —
    // but nothing in it is collected and nothing below it is entered.
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
   * **Do not extend the prune-by-name list.** `build`, `dist`, `out` are legitimate
   * names inside a document folder, and pruning by name silently drops someone's
   * documents — losing data to fix a crash is the worse trade.
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
    // **Silent truncation reads as "we saw everything".**
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
