import { describe, expect, it } from 'vitest';
import type { StampedVaultEntry } from '@/shared/lib/vault-folder/native-vault/tauri-vault-files';
import type { VaultPathChange } from '@/shared/lib/vault-folder/vault-change-batch';
import type { VaultDoc, VaultManifest } from '../../../model/vault-manifest';
import type { BuiltVaultEntry } from '../md-entry';
import { deltaCeiling, planVaultChanges, sameStamp, type ListDir } from './plan-vault-changes';
import { takeState } from './vault-delta-state';

const handle = {} as FileSystemFileHandle;

function note(path: string, lastModified = 1): BuiltVaultEntry {
  return { relativePath: path, lastModified, handle, kind: 'md', doc: { slug: path.replace(/\.md$/, '') } as VaultDoc };
}

function source(path: string, lastModified: number, bytes: number): BuiltVaultEntry {
  return { relativePath: path, lastModified, handle, kind: 'source', bytes };
}

const emptyManifest = {} as VaultManifest;
const neverListed: ListDir = async () => {
  throw new Error('no folder should be listed');
};
const nothingPending = async () => new Set<string>();

function plan(
  entries: BuiltVaultEntry[],
  changes: VaultPathChange[],
  options: { manifest?: Partial<VaultManifest>; list?: ListDir; pending?: Set<string> } = {},
) {
  return planVaultChanges(
    { ...emptyManifest, ...options.manifest } as VaultManifest,
    takeState(entries),
    changes,
    options.list ?? neverListed,
    options.pending ? async () => options.pending! : nothingPending,
  );
}

const file = (path: string, lastModified = 2, size = 10): VaultPathChange => ({ path, kind: 'file', lastModified, size });

describe('sameStamp', () => {
  it('is true only when the reported mtime is the one the last build read', () => {
    expect(sameStamp(note('a.md', 5), 5, 1)).toBe(true);
    expect(sameStamp(note('a.md', 5), 6, 1)).toBe(false);
    expect(sameStamp(note('a.md', 5), undefined, undefined)).toBe(false);
  });

  it('also needs the same size for a raw source', () => {
    expect(sameStamp(source('sources/a.pdf', 5, 100), 5, 100)).toBe(true);
    expect(sameStamp(source('sources/a.pdf', 5, 100), 5, 101)).toBe(false);
  });
});

describe('deltaCeiling', () => {
  it('is a fifth of the known files and never below 1,000', () => {
    expect(deltaCeiling(0)).toBe(1_000);
    expect(deltaCeiling(4_999)).toBe(1_000);
    expect(deltaCeiling(10_000)).toBe(2_000);
    expect(deltaCeiling(50_000)).toBe(10_000);
  });
});

describe('planVaultChanges: which reported paths are acted on', () => {
  it('gives up on a path that is not confined to the vault', async () => {
    expect(await plan([], [file('../outside.md')])).toBeNull();
    expect(await plan([], [file('notes\\a.md')])).toBeNull();
  });

  it('notes a changed sidecar or hidden path and plans no read for it', async () => {
    const result = await plan([], [file('.ontology-atlas/log.jsonl'), file('notes/.hidden.md')]);
    expect(result).toMatchObject({ sidecarsTouched: true });
    expect(result!.upserts.size).toBe(0);
    expect(result!.removals.size).toBe(0);
  });

  it('ignores a writer temporary and anything under a pruned folder', async () => {
    const result = await plan([], [file('notes/.a.md.oatlas-tmp-123-ab-cd'), file('node_modules/pkg/readme.md')]);
    expect(result).toMatchObject({ sidecarsTouched: false });
    expect(result!.upserts.size).toBe(0);
  });

  it('gives up when a source-code file is reported, because only a walk recounts those', async () => {
    expect(await plan([], [file('src/main.ts')])).toBeNull();
  });

  it('gives up when a cache tag appears, since it prunes or un-prunes its folder', async () => {
    expect(await plan([], [file('cache/CACHEDIR.TAG')])).toBeNull();
  });

  it('gives up when a case-only rename reports both spellings', async () => {
    expect(await plan([note('notes/a.md')], [file('notes/A.md'), file('notes/a.md')])).toBeNull();
  });
});

describe('planVaultChanges: reads and removals', () => {
  it('reads a Markdown file whose stamp moved and not one whose stamp is the known one', async () => {
    const entries = [note('a.md', 1), note('b.md', 1)];
    const result = await plan(entries, [file('a.md', 2, 7), file('b.md', 1, 7), file('c.md', 3, 9)]);
    expect([...result!.upserts.values()]).toEqual([
      { path: 'a.md', kind: 'md', lastModified: 2, size: 7 },
      { path: 'c.md', kind: 'md', lastModified: 3, size: 9 },
    ]);
    expect(result!.removals.size).toBe(0);
  });

  it('removes a known file that is reported missing and ignores one that was never known', async () => {
    const result = await plan([note('a.md')], [{ path: 'a.md', kind: 'missing' }, { path: 'never.md', kind: 'missing' }]);
    expect([...result!.removals]).toEqual(['a.md']);
    expect(result!.upserts.size).toBe(0);
  });

  it('does not read a raw source whose copy is still being published, and removes a known one', async () => {
    const entries = [source('sources/old.pdf', 1, 5)];
    const result = await plan(entries, [file('sources/new.pdf', 2, 5), file('sources/old.pdf', 3, 6)], {
      pending: new Set(['sources/new.pdf', 'sources/old.pdf']),
    });
    expect(result!.upserts.size).toBe(0);
    expect([...result!.removals]).toEqual(['sources/old.pdf']);
  });

  it('gives up past the ceiling, where a walk is cheaper', async () => {
    const many = Array.from({ length: 1_001 }, (_, i) => file(`bulk/n${i}.md`));
    expect(await plan([], many)).toBeNull();
    expect((await plan([], many.slice(0, 1_000)))!.upserts.size).toBe(1_000);
  });
});

describe('planVaultChanges: a reported folder is listed again whole', () => {
  const entries = [note('a/keep.md', 1), note('a/gone.md', 1), note('b/other.md', 1)];
  const listing = (children: StampedVaultEntry[]): ListDir => async (dir) => {
    expect(dir).toBe('a');
    return children;
  };

  it('removes the known files the listing no longer has and reads the ones it newly has', async () => {
    const result = await plan(entries, [{ path: 'a', kind: 'directory' }], {
      list: listing([
        { name: 'keep.md', kind: 'file', lastModified: 1, size: 3 },
        { name: 'fresh.md', kind: 'file', lastModified: 9, size: 4 },
      ]),
    });
    expect([...result!.removals]).toEqual(['a/gone.md']);
    expect([...result!.upserts.values()]).toEqual([{ path: 'a/fresh.md', kind: 'md', lastModified: 9, size: 4 }]);
  });

  it('removes every known file under a folder that is reported missing', async () => {
    const result = await plan(entries, [{ path: 'a', kind: 'missing' }]);
    expect([...result!.removals].sort()).toEqual(['a/gone.md', 'a/keep.md']);
  });

  it('gives up when a folder with counted source-code files is reported missing, since they were never listed', async () => {
    const result = await plan(entries, [{ path: 'a', kind: 'missing' }], { manifest: { sourceFileCount: 1 } });
    expect(result).toBeNull();
  });

  it('does not make documents of hidden entries inside a moved-in folder', async () => {
    const listed: string[] = [];
    const result = await plan(entries, [{ path: 'a', kind: 'directory' }], {
      list: async (dir) => {
        listed.push(dir);
        return [
          { name: 'fresh.md', kind: 'file', lastModified: 9, size: 4 },
          { name: '.hidden.md', kind: 'file', lastModified: 9, size: 4 },
          { name: '.git', kind: 'directory' },
          ...(dir === 'a/.git' ? [{ name: 'x.md', kind: 'file' as const, lastModified: 9, size: 4 }] : []),
        ];
      },
    });
    expect(listed).toEqual(['a']);
    expect([...result!.upserts.keys()]).toEqual(['a/fresh.md']);
  });

  it('does not make documents of a node_modules folder inside a moved-in folder, and expects it to stay pruned', async () => {
    const listed: string[] = [];
    const list: ListDir = async (dir) => {
      listed.push(dir);
      return [
        { name: 'fresh.md', kind: 'file', lastModified: 9, size: 4 },
        { name: 'node_modules', kind: 'directory' },
        ...(dir === 'a/node_modules' ? [{ name: 'dep.md', kind: 'file' as const, lastModified: 9, size: 4 }] : []),
      ];
    };
    const result = await plan(entries, [{ path: 'a', kind: 'directory' }], { list, manifest: { prunedDirs: ['a/node_modules'] } });
    expect(listed).toEqual(['a']);
    expect([...result!.upserts.keys()]).toEqual(['a/fresh.md']);
    expect(await plan(entries, [{ path: 'a', kind: 'directory' }], { list })).toBeNull();
  });

  it('gives up when the listing prunes a folder the last walk did not', async () => {
    const result = await plan(entries, [{ path: 'a', kind: 'directory' }], {
      list: listing([{ name: 'CACHEDIR.TAG', kind: 'file', lastModified: 1, size: 1 }]),
    });
    expect(result).toBeNull();
  });

  it('gives up when the folder cannot be listed because it is gone', async () => {
    const gone = Object.assign(new Error('gone'), { name: 'NotFoundError' });
    const result = await plan(entries, [{ path: 'a', kind: 'directory' }], {
      list: async () => {
        throw gone;
      },
    });
    expect(result).toBeNull();
  });
});
