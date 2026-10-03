import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultManifest } from '../model/types';

const nativeVaultFingerprint = vi.fn();
const readTauriVaultTextFile = vi.fn();
const readTauriVaultTextFiles = vi.fn();
vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  nativeVaultFingerprint: (rootPath: string) => nativeVaultFingerprint(rootPath),
  readTauriVaultTextFile: (rootPath: string, relativePath: string) => readTauriVaultTextFile(rootPath, relativePath),
  readTauriVaultTextFiles: (rootPath: string, relativePaths: string[]) =>
    readTauriVaultTextFiles(rootPath, relativePaths),
}));

const { buildLocalManifest, buildLocalManifestWithEntries } = await import('./build-local-manifest');

type Files = Map<string, string>;

async function turns(count: number) {
  for (let i = 0; i < count; i += 1) await Promise.resolve();
}

function makeRoot(files: Files, opens: string[] = [], rootPath?: string): FileSystemDirectoryHandle {
  interface Dir {
    dirs: Map<string, Dir>;
    files: Map<string, string>;
  }
  const top: Dir = { dirs: new Map(), files: new Map() };
  for (const path of files.keys()) {
    const parts = path.split('/');
    let dir = top;
    for (const part of parts.slice(0, -1)) {
      if (!dir.dirs.has(part)) dir.dirs.set(part, { dirs: new Map(), files: new Map() });
      dir = dir.dirs.get(part)!;
    }
    dir.files.set(parts[parts.length - 1], path);
  }
  let turn = 0;
  const fileHandle = (name: string, path: string) =>
    ({
      kind: 'file',
      name,
      getFile: async () => {
        opens.push(path);
        await turns((turn += 3) % 7);
        const text = files.get(path)!;
        return { lastModified: 1_700_000_000_000, size: text.length, text: async () => text } as unknown as File;
      },
    }) as unknown as FileSystemFileHandle;
  const dirHandle = (name: string, dir: Dir): FileSystemDirectoryHandle =>
    ({
      kind: 'directory',
      name,
      entries: async function* () {
        for (const [fileName, path] of dir.files) yield [fileName, fileHandle(fileName, path)] as const;
        for (const [dirName, sub] of dir.dirs) yield [dirName, dirHandle(dirName, sub)] as const;
      },
    }) as unknown as FileSystemDirectoryHandle;
  const root = dirHandle('ProgressVault', top) as unknown as Record<string, unknown>;
  if (rootPath) root.rootPath = rootPath;
  return root as unknown as FileSystemDirectoryHandle;
}

const doc = (kind: string, title: string, extra = '') =>
  `---\nkind: ${kind}\ntitle: ${title}\n${extra}---\n\n# ${title}\n\nBody of ${title}.\n`;

function makeVault(elements = 600): Files {
  const files: Files = new Map();
  for (let n = 0; n < 30; n += 1) files.set(`notes/n-${n}.md`, `# Note ${n}\n`);
  for (let n = 0; n < elements; n += 1) {
    files.set(`elements/e-${n}.md`, doc('element', `Element ${n}`));
  }
  for (let n = 0; n < 40; n += 1) {
    const listed = Array.from({ length: 5 }, (_, k) => `elements/e-${(n * 5 + k) % elements}`);
    files.set(
      `capabilities/c-${n}.md`,
      doc('capability', `Capability ${n}`, `domain: domains/d-${n % 4}\nelements: [${listed.join(', ')}]\n`),
    );
  }
  for (let n = 0; n < 4; n += 1) files.set(`domains/d-${n}.md`, doc('domain', `Domain ${n}`));
  files.set('atlas.md', doc('project', 'Atlas', 'domains: [domains/d-0, domains/d-1, domains/d-2, domains/d-3]\n'));
  files.set('assets/cover.png', 'PNG');
  return files;
}

const TIER = ['', 'projects/', 'domains/', 'capabilities/', 'elements/'];
function tierOf(path: string): number {
  if (!path.endsWith('.md')) return 6;
  if (!path.includes('/')) return 0;
  const at = TIER.findIndex((prefix, index) => index > 0 && path.startsWith(prefix));
  return at < 0 ? 5 : at;
}

function serialize(manifest: VaultManifest): string {
  const { generatedAt: _ignored, ...rest } = manifest;
  void _ignored;
  return JSON.stringify(rest);
}

beforeEach(() => {
  nativeVaultFingerprint.mockReset().mockResolvedValue(null);
  readTauriVaultTextFile.mockReset().mockResolvedValue(null);
  readTauriVaultTextFiles.mockReset().mockResolvedValue(null);
});

describe('progressive manifest build', () => {
  it('starts reading the project, then domains, capabilities and elements, before other documents', async () => {
    const opens: string[] = [];
    await buildLocalManifestWithEntries(makeRoot(makeVault(), opens));

    const tiers = opens.map(tierOf);
    expect(opens.length).toBe(676);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
  });

  it('publishes each finished tier, grows only, and ends equal to a one-at-a-time build', async () => {
    const files = makeVault();
    const partials: VaultManifest[] = [];
    const progress: Array<{ read: number; total: number }> = [];
    const { build } = await buildLocalManifestWithEntries(makeRoot(files), {
      partialAfterMs: 0,
      partialIntervalMs: 0,
      onPartial: (partial) => partials.push(partial.manifest),
      onProgress: (step) => progress.push(step),
    });
    const reference = await buildLocalManifest(makeRoot(files), 1);

    expect(serialize(build.manifest)).toBe(serialize(reference.manifest));
    const shown = partials.map((manifest) => manifest.docs.map((entry) => entry.path));
    expect(shown[0]).toEqual(['atlas.md']);
    expect(shown[1]).toEqual(['atlas.md', 'domains/d-0.md', 'domains/d-1.md', 'domains/d-2.md', 'domains/d-3.md']);
    expect(shown[2].filter((path) => path.startsWith('capabilities/'))).toHaveLength(40);
    expect(shown[2].some((path) => path.startsWith('elements/'))).toBe(false);
    for (let at = 1; at < shown.length; at += 1) {
      expect(shown[at].length).toBeGreaterThan(shown[at - 1].length);
      expect(shown[at]).toEqual(expect.arrayContaining(shown[at - 1]));
    }
    expect(shown.map((paths) => paths.length)).toEqual([1, 5, 45, 645]);
    expect(shown.flat().some((path) => path.startsWith('notes/'))).toBe(false);
    expect(progress.at(-1)).toEqual({ read: 675, total: 675 });
    expect(progress.map((step) => step.read)).toEqual([...progress.map((step) => step.read)].sort((a, b) => a - b));
  });

  it('publishes what was read once the delay passes, even while every later read stalls', async () => {
    const files = makeVault();
    const held = Promise.withResolvers<void>();
    readTauriVaultTextFiles.mockImplementation(async (_root: string, paths: string[]) => {
      if (paths.some((path) => path.startsWith('elements/') || path.startsWith('notes/'))) await held.promise;
      return paths.map((relativePath) => ({ relativePath, text: files.get(relativePath)!, lastModified: 1_700_000_000_000, error: null }));
    });
    const partials: string[][] = [];
    const built = buildLocalManifestWithEntries(makeRoot(files, [], '/vault'), {
      partialAfterMs: 150,
      onPartial: (partial) => partials.push(partial.manifest.docs.map((entry) => entry.path)),
    });
    await vi.waitFor(() => expect(partials.length).toBeGreaterThan(0), { timeout: 2_000, interval: 10 });
    expect(partials[0]!.filter((path) => path.startsWith('capabilities/'))).toHaveLength(40);
    expect(partials[0]!.some((path) => path.startsWith('elements/'))).toBe(false);
    held.resolve();
    const { build } = await built;
    expect(build.manifest.docs).toHaveLength(675);
  });

  it('publishes nothing when the read is over before the delay', async () => {
    const onPartial = vi.fn();
    await buildLocalManifestWithEntries(makeRoot(makeVault()), { onPartial, partialAfterMs: 60_000 });
    expect(onPartial).not.toHaveBeenCalled();
  });

  it('publishes at most once a second and splits a folder into quarters only three times', async () => {
    let clock = 0;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const files = makeVault(2400);
    const opens: string[] = [];
    const published: Array<{ at: number; docs: number }> = [];
    try {
      const counting = new Proxy(opens, {
        get(target, key, receiver) {
          if (key === 'push') {
            return (...items: string[]) => {
              clock += 5;
              return target.push(...items);
            };
          }
          return Reflect.get(target, key, receiver);
        },
      });
      await buildLocalManifestWithEntries(makeRoot(files, counting as string[]), {
        partialAfterMs: 0,
        onPartial: (partial) => published.push({ at: clock, docs: partial.manifest.docs.length }),
      });
    } finally {
      now.mockRestore();
    }

    expect(published.length).toBeGreaterThan(1);
    for (let at = 1; at < published.length; at += 1) {
      expect(published[at].at - published[at - 1].at).toBeGreaterThanOrEqual(1000);
    }
    const elementsTier = published.filter((step) => step.docs > 45 && step.docs < 2475);
    expect(elementsTier.length).toBeLessThanOrEqual(3);
  });

  it('publishes nothing for a folder of fewer than 400 documents', async () => {
    const onPartial = vi.fn();
    const onProgress = vi.fn();
    await buildLocalManifestWithEntries(makeRoot(makeVault(300)), { onPartial, onProgress, partialAfterMs: 0, partialIntervalMs: 0 });
    expect(onPartial).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenLastCalledWith({ read: 375, total: 375 });
  });

  it('reads the app vault in batches of Markdown and nothing else', async () => {
    const files = makeVault();
    readTauriVaultTextFiles.mockImplementation(async (_root: string, paths: string[]) =>
      paths.map((relativePath) => ({ relativePath, text: files.get(relativePath)!, lastModified: 1_700_000_000_000, error: null })),
    );
    const opens: string[] = [];
    const { build } = await buildLocalManifestWithEntries(makeRoot(files, opens, '/vault'));

    expect(serialize(build.manifest)).toBe(serialize((await buildLocalManifest(makeRoot(files), 1)).manifest));
    const asked = readTauriVaultTextFiles.mock.calls.map(([, paths]) => paths as string[]);
    expect(asked.flat().sort()).toEqual([...files.keys()].filter((path) => path.endsWith('.md')).sort());
    expect(asked.length).toBeLessThanOrEqual(20);
    expect(asked.every((paths) => new Set(paths.map(tierOf)).size === 1)).toBe(true);
    expect(readTauriVaultTextFile).not.toHaveBeenCalled();
    expect(opens.filter((path) => path.endsWith('.md'))).toEqual([]);
  });

  it('reads singly only the file a batch could not answer', async () => {
    const files = makeVault(100);
    readTauriVaultTextFile.mockImplementation(async (_root: string, relativePath: string) => ({
      text: files.get(relativePath)!,
      lastModified: 1_700_000_000_000,
    }));
    readTauriVaultTextFiles.mockImplementation(async (_root: string, paths: string[]) =>
      paths.map((relativePath) =>
        relativePath === 'domains/d-2.md'
          ? { relativePath, text: null, lastModified: null, error: 'denied' }
          : { relativePath, text: files.get(relativePath)!, lastModified: 1_700_000_000_000, error: null },
      ),
    );
    const { build } = await buildLocalManifestWithEntries(makeRoot(files, [], '/vault'));

    expect(serialize(build.manifest)).toBe(serialize((await buildLocalManifest(makeRoot(files), 1)).manifest));
    expect(readTauriVaultTextFile.mock.calls.map(([, path]) => path)).toEqual(['domains/d-2.md']);
  });

  it('reads every file singly when the batch command is missing, with the same result', async () => {
    const files = makeVault(100);
    readTauriVaultTextFile.mockImplementation(async (_root: string, relativePath: string) => ({
      text: files.get(relativePath)!,
      lastModified: 1_700_000_000_000,
    }));
    readTauriVaultTextFiles.mockRejectedValue(new Error('unknown command read_vault_text_files'));
    const { build } = await buildLocalManifestWithEntries(makeRoot(files, [], '/vault'));

    expect(serialize(build.manifest)).toBe(serialize((await buildLocalManifest(makeRoot(files), 1)).manifest));
    expect(readTauriVaultTextFile).toHaveBeenCalledTimes(175);
  });
});
