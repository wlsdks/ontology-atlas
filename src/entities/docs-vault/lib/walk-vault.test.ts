import { describe, expect, it } from 'vitest';

import {
  VAULT_WALK_MAX_DEPTH,
  VAULT_WALK_MAX_ENTRIES,
  walkVault,
} from './build-local-manifest';

/**
 * The walk's boundary: a repository root picked as a vault must not drag build trees across IPC.
 * Locked by what is entered, not by milliseconds, which vary by machine.
 */

type Entry = readonly [string, FakeFile | FakeDir];

class FakeFile {
  readonly kind = 'file' as const;
  constructor(readonly name: string) {}
}

class FakeDir {
  readonly kind = 'directory' as const;
  /** Whether the walk entered this directory. */
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

describe('walkVault boundaries', () => {
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

  it('keeps a Markdown file under sources/ as a raw source, not a page', async () => {
    // Markdown exports and imports under `sources/` belong to the Library verbatim, not the graph.
    const result = await run(
      dir('vault', [
        file('a.md'),
        dir('sources', [file('notes.md'), file('plan.pdf'), dir('deep', [file('memo.md')])]),
        dir('wiki', [file('page.md')]),
      ]),
    );
    const kinds = Object.fromEntries(result.entries.map((e) => [e.relativePath, e.kind]));
    expect(kinds).toEqual({
      'a.md': 'md',
      'sources/notes.md': 'source',
      'sources/plan.pdf': 'source',
      'sources/deep/memo.md': 'source',
      'wiki/page.md': 'md',
    });
  });

  it('normalizes NFD filesystem names to NFC so Hangul slugs match NFC refs', async () => {
    // macOS returns NFD names while refs are NFC; an unnormalized slug would dangle.
    const nfdName = '결제.md'.normalize('NFD');
    const nfdDir = '도메인'.normalize('NFD');
    const result = await run(dir('vault', [file(nfdName), dir(nfdDir, [file(nfdName)])]));
    expect(result.entries.map((e) => e.relativePath).sort()).toEqual([
      '결제.md'.normalize('NFC'),
      `${'도메인'.normalize('NFC')}/${'결제.md'.normalize('NFC')}`,
    ]);
  });

  /** `CACHEDIR.TAG` is the public cache-directory convention (Cargo writes one into `target/`). */
  it('never descends into a directory that declares itself a cache', async () => {
    const target = dir('target', [file('CACHEDIR.TAG'), file('vendored.md')]);
    const result = await run(dir('repo', [file('README.md'), target]));

    // The tag is in the listing, so the directory is listed once and nothing in it is collected.
    expect(result.entries.map((e) => e.relativePath)).toEqual(['README.md']);
    expect(result.prunedDirs).toEqual(['target']);
  });

  it('never descends into node_modules', async () => {
    const deps = dir('node_modules', [file('readme.md')]);
    const result = await run(dir('repo', [file('a.md'), deps]));

    expect(deps.visited).toBe(false);
    expect(result.prunedDirs).toEqual(['node_modules']);
  });

  /** Prune-by-name stays narrow: `build`, `dist`, `out` can hold documents. */
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
    // Truncation must be reported, never silent.
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
