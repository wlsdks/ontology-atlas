import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultDoc, VaultManifest } from '@/entities/docs-vault';
import type { GitChangeEntry, GitDiffResult, GitPathLastChange } from '@/shared/lib/tauri-git';

const mocks = vi.hoisted(() => ({
  vault: {
    status: 'loaded',
    manifest: null as VaultManifest | null,
    handle: { rootPath: '/vaults/atlas' } as unknown,
  },
  bridge: true,
  pathsLastChange: vi.fn(),
  diff: vi.fn(),
}));

vi.mock('@/entities/vault-session/model/use-data-source-mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/use-data-source-mode')>()),
  useDataSourceMode: () => 'local',
}));
vi.mock('@/entities/vault-session/model/use-sample-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/use-sample-source')>()),
  useSampleSource: () => ['dogfood'],
}));
vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => mocks.vault,
}));
vi.mock('@/shared/lib/tauri-git', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tauri-git')>()),
  isGitBridgeAvailable: () => mocks.bridge,
  gitPathsLastChange: (...args: unknown[]) => mocks.pathsLastChange(...args),
  gitDiff: (...args: unknown[]) => mocks.diff(...args),
}));
vi.mock('@/shared/lib/tauri-vault-fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tauri-vault-fs')>()),
  getTauriVaultRootPath: (handle: { rootPath?: string }) => handle.rootPath,
}));

import { useVaultDocDates } from './use-vault-doc-freshness';

/** Every file was written a moment ago — a clone, a checkout, a restored backup. */
const LANDED = '2026-09-26T00:30:00.000Z';

function doc(slug: string, updatedAt = LANDED): VaultDoc {
  return {
    path: `${slug}.md`,
    slug,
    title: slug,
    tags: [],
    frontmatter: { slug, kind: slug.split('/')[0]!.replace(/s$/, '') },
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt,
    linksOut: [],
  };
}

function manifest(docs: VaultDoc[]): VaultManifest {
  return { version: '1', generatedAt: LANDED, docs, backlinksDetail: {}, tags: {}, tree: { name: 'root', path: '', type: 'dir', children: [] } };
}

const committed = (path: string, lastChangedAt: string | null): GitPathLastChange => ({ path, exists: true, isDir: false, lastChangedAt });
const change = (path: string): GitChangeEntry => ({ path, status: 'modified', kind: null, slug: path.replace(/\.md$/, ''), renamedFrom: null });
const diff = (paths: string[]): GitDiffResult => ({ count: paths.length, files: paths.map(change), diff: '' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let folder = 0;
beforeEach(() => {
  mocks.bridge = true;
  mocks.pathsLastChange.mockReset();
  mocks.diff.mockReset();
  // The settled walk is shared by every reader for the life of the page; each test opens its own
  // folder so one test's answer is never another's.
  folder += 1;
  mocks.vault = { ...mocks.vault, handle: { rootPath: `/vaults/atlas-${folder}` } };
});

describe('useVaultDocDates', () => {
  it('claims no date while Git is first asked, then dates each document by Git', async () => {
    mocks.vault = { ...mocks.vault, manifest: manifest([doc('capabilities/git-history'), doc('capabilities/library')]) };
    const walk = deferred<GitPathLastChange[]>();
    mocks.pathsLastChange.mockReturnValue(walk.promise);
    mocks.diff.mockResolvedValue(diff(['capabilities/library.md']));

    const { result } = renderHook(() => useVaultDocDates());
    // Before Git answers, the files' own dates (all "just now") are not handed out as change dates.
    expect(result.current.reading).toBe(true);
    expect(result.current.index.size).toBe(0);

    await act(async () => {
      walk.resolve([committed('capabilities/git-history.md', '2026-09-22T10:05:00+09:00'), committed('capabilities/library.md', '2026-09-22T10:05:00+09:00')]);
    });
    expect(result.current.reading).toBe(false);
    expect(result.current.index.get('capabilities/git-history')).toBe('2026-09-22T10:05:00+09:00');
    // Edited since its last commit: the edit is the change.
    expect(result.current.index.get('capabilities/library')).toBe(LANDED);
    expect(mocks.pathsLastChange).toHaveBeenCalledWith(`/vaults/atlas-${folder}`, [], ['capabilities/git-history.md', 'capabilities/library.md']);
  });

  it('keeps the last answer across a re-read of the same folder, dating only a rewritten file by its file', async () => {
    mocks.vault = { ...mocks.vault, manifest: manifest([doc('capabilities/git-history'), doc('capabilities/library')]) };
    mocks.pathsLastChange.mockResolvedValue([
      committed('capabilities/git-history.md', '2026-09-22T10:05:00+09:00'),
      committed('capabilities/library.md', '2026-09-23T10:05:00+09:00'),
    ]);
    mocks.diff.mockResolvedValue(diff([]));
    const { result, rerender } = renderHook(() => useVaultDocDates());
    await waitFor(() => expect(result.current.reading).toBe(false));

    // The watcher re-reads the folder after one document is written; Git has not answered again.
    const rewritten = '2026-09-26T01:00:00.000Z';
    mocks.pathsLastChange.mockReturnValue(new Promise(() => {}));
    mocks.vault = { ...mocks.vault, manifest: manifest([doc('capabilities/git-history'), doc('capabilities/library', rewritten)]) };
    rerender();

    expect(result.current.reading).toBe(false);
    expect(result.current.index.get('capabilities/git-history')).toBe('2026-09-22T10:05:00+09:00');
    expect(result.current.index.get('capabilities/library')).toBe(rewritten);
  });

  it('starts a reader mounted after Git answered from that answer, asking Git nothing more', async () => {
    mocks.vault = { ...mocks.vault, manifest: manifest([doc('capabilities/git-history')]) };
    mocks.pathsLastChange.mockResolvedValue([committed('capabilities/git-history.md', '2026-09-22T10:05:00+09:00')]);
    mocks.diff.mockResolvedValue(diff([]));
    const first = renderHook(() => useVaultDocDates());
    await waitFor(() => expect(first.result.current.reading).toBe(false));

    // Back to the map, or on to Analysis: a new reader of the same folder read.
    const second = renderHook(() => useVaultDocDates());
    expect(second.result.current.reading).toBe(false);
    expect(second.result.current.index.get('capabilities/git-history')).toBe('2026-09-22T10:05:00+09:00');
    expect(mocks.pathsLastChange).toHaveBeenCalledTimes(1);
  });

  it('keeps the files’ dates for a folder Git cannot read', async () => {
    mocks.vault = { ...mocks.vault, manifest: manifest([doc('capabilities/git-history')]) };
    mocks.pathsLastChange.mockRejectedValue('git-repo-missing: ');
    mocks.diff.mockRejectedValue('git-repo-missing: ');
    const { result } = renderHook(() => useVaultDocDates());

    await waitFor(() => expect(result.current.reading).toBe(false));
    expect(result.current.index.get('capabilities/git-history')).toBe(LANDED);
  });

  it('reads the manifest at once where there is no Git bridge (the web build)', () => {
    mocks.bridge = false;
    mocks.vault = { ...mocks.vault, manifest: manifest([doc('capabilities/git-history')]) };
    const { result } = renderHook(() => useVaultDocDates());

    expect(result.current.reading).toBe(false);
    expect(result.current.index.get('capabilities/git-history')).toBe(LANDED);
    expect(mocks.pathsLastChange).not.toHaveBeenCalled();
  });
});
