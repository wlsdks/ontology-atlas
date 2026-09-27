import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultManifest } from '../model/types';

/**
 * **An incremental rebuild must not open a file just to learn its mtime.**
 *
 * Measured 2026-08-09 in the installed app. `rebuildLocalManifestIncremental`
 * exists to re-read only changed files, yet it called `getFile()` per file to find
 * out *what* changed. Under Tauri that is a `read_vault_text_file` IPC round trip
 * returning **the whole body**, so body re-parsing was saved while transfer and
 * round trips were not.
 *
 * Time from editing one file to the app's map catching up:
 *
 * | Vault | Time to reflect |
 * |---|---|
 * | 71 files | 2.0 s (not yet at 1.6 s) |
 * | 5 files | 0.7 s |
 *
 * Linear in file count at ≈20 ms each, matching an IPC round trip. Reading those
 * same 71 files from disk costs **1.8 ms** — the time went to the bridge, not the work.
 *
 * The fix was not a new native command: `vault_fingerprint` returns paths and
 * mtimes in one call and was already used in the same file.
 *
 * **What this gate locks:** when native stamps are available, an unchanged file is
 * never opened.
 *
 * ⚠️ **It does not measure milliseconds** — those vary by machine and fail
 * intermittently. Per `.claude/rules/architecture.md`, lock the *number of calls*,
 * not the duration. So this counts `getFile()` invocations, which are the same
 * everywhere.
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

/** Mock root that counts `getFile()` calls per path. */
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

describe('incremental rebuild with native stamps skips unchanged files', () => {
  it('opens only the one changed file', async () => {
    // Pass 1: a full build produces the previous entries (opening everything is correct here).
    const seedOpens = new Map<string, number>();
    const seed = await buildLocalManifestWithEntries(makeRoot(FILES, seedOpens, '/vault'));
    expect(seedOpens.size, 'the first build opened no file, so this test proves nothing').toBe(5);

    // Pass 2: only b.md changes mtime.
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

    expect(nativeVaultFingerprint).toHaveBeenCalledTimes(1);
    expect(
      [...opens.keys()],
      'only the changed file is opened; the rest are reused by mtime',
    ).toEqual(['capabilities/b.md']);

    // And the result must equal a full build — the incremental path's safety contract.
    const fullOpens = new Map<string, number>();
    const full = await buildLocalManifest(makeRoot(changed, fullOpens, '/vault'));
    expect(stripGenerated(result.build.manifest)).toEqual(stripGenerated(full.manifest));
  });

  it('opens no file when nothing changed', async () => {
    const seedOpens = new Map<string, number>();
    const seed = await buildLocalManifestWithEntries(makeRoot(FILES, seedOpens, '/vault'));
    nativeVaultFingerprint.mockResolvedValue(stampsFor(FILES));

    const opens = new Map<string, number>();
    await rebuildLocalManifestIncremental(makeRoot(FILES, opens, '/vault'), seed.entries);
    expect([...opens.keys()], 'a file was opened although nothing changed').toEqual([]);
  });

  it('reads a new file even when a stamp exists, since no previous result exists', async () => {
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
   * Fallback — the web has no batch API (`null`), so it drops to the previous path
   * and opens **each file** to read its mtime. The contract is that behaviour does
   * not change.
   */
  it('checks each file when no native stamps exist (web)', async () => {
    const seedOpens = new Map<string, number>();
    const seed = await buildLocalManifestWithEntries(makeRoot(FILES, seedOpens));
    nativeVaultFingerprint.mockResolvedValue(null);

    const opens = new Map<string, number>();
    await rebuildLocalManifestIncremental(makeRoot(FILES, opens), seed.entries);
    expect(
      opens.size,
      'the web path opens each file to read its mtime',
    ).toBe(5);
  });

  it('falls back to per-file checks when the native call throws', async () => {
    const seedOpens = new Map<string, number>();
    const seed = await buildLocalManifestWithEntries(makeRoot(FILES, seedOpens, '/vault'));
    nativeVaultFingerprint.mockRejectedValue(new Error('bridge down'));

    const opens = new Map<string, number>();
    const result = await rebuildLocalManifestIncremental(
      makeRoot(FILES, opens, '/vault'),
      seed.entries,
    );
    expect(opens.size, 'a native failure falls back to the per-file path').toBe(5);
    expect(result.build.manifest.docs.length).toBe(5);
  });
});
