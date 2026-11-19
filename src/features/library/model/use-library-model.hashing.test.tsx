import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultDoc, VaultSourceFile } from '@/entities/docs-vault';

import { SOURCE_HASH_CHUNK, SOURCE_HASH_PUBLISH_MS, useLibraryModel } from './use-library-model';

const native = vi.hoisted(() => ({ hash: vi.fn() }));
vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', () => ({
  nativeVaultFileHashResults: native.hash,
}));

const HASH = 'a'.repeat(64);

function sources(count: number): VaultSourceFile[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `sources/s${index}.md`, name: `s${index}.md`, format: 'md', bytes: 1, mtime: 1,
  }));
}

/** One page citing every source with a recorded hash, so each one needs measuring. */
function citing(files: readonly VaultSourceFile[]): VaultDoc[] {
  return [{
    slug: 'wiki/all', path: 'wiki/all.md', title: 'All', tags: [], headings: [], excerpt: '', linksOut: [],
    updatedAt: '', wordCount: 0, mtime: 1,
    frontmatter: {
      sources: files.map(({ path }) => path),
      source_hash: Object.fromEntries(files.map(({ path }) => [path, HASH])),
    },
  }];
}

function render(files: VaultSourceFile[]) {
  const input = {
    docs: citing(files), sources: files, sourceHandles: new Map(), fileHandles: new Map(),
    vaultRootPath: '/vault', vaultScope: 'app:/vault', enabled: true,
  };
  return renderHook(() => useLibraryModel(input));
}

const count = (rows: ReadonlyArray<{ state: string }>, state: string) =>
  rows.filter((row) => row.state === state).length;

beforeEach(() => {
  native.hash.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Pending = Array<{ paths: string[]; resolve: (value: Map<string, string | null>) => void }>;

function deferNativeCalls(): Pending {
  const pending: Pending = [];
  native.hash.mockImplementation((_root: string, paths: string[]) =>
    new Promise((resolve) => pending.push({ paths, resolve })));
  return pending;
}

const answer = (call: Pending[number]) => call.resolve(new Map(call.paths.map((path) => [path, HASH])));

describe('cited sources are hashed natively in chunks', () => {
  it('asks for at most one chunk per call and shrinks the checking count once a chunk is a publish interval old', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += SOURCE_HASH_PUBLISH_MS));
    const pending = deferNativeCalls();
    const { result } = render(sources(600));

    await waitFor(() => expect(pending).toHaveLength(1));
    expect(pending[0].paths).toHaveLength(SOURCE_HASH_CHUNK);
    expect(count(result.current.sources, 'checking')).toBe(600);

    await act(async () => answer(pending[0]));
    expect(count(result.current.sources, 'checking')).toBe(600 - SOURCE_HASH_CHUNK);
    await act(async () => answer(pending[1]));
    expect(pending[2].paths).toHaveLength(600 - 2 * SOURCE_HASH_CHUNK);
    await act(async () => answer(pending[2]));

    expect(count(result.current.sources, 'compiled')).toBe(600);
    expect(new Set(pending.flatMap(({ paths }) => paths)).size).toBe(600);
  });

  it('holds back chunks that finish within one publish interval, so the model is not rebuilt per chunk', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const pending = deferNativeCalls();
    const { result } = render(sources(600));

    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => answer(pending[0]));
    expect(count(result.current.sources, 'checking')).toBe(600);
    await act(async () => answer(pending[1]));
    await act(async () => answer(pending[2]));
    expect(count(result.current.sources, 'compiled')).toBe(600);
    expect(native.hash).toHaveBeenCalledTimes(3);
  });

  it('keeps a file the app could not open as unreadable and does not ask for it again', async () => {
    const files = sources(2);
    native.hash.mockImplementation(async (_root: string, paths: string[]) =>
      new Map(paths.map((path) => [path, path === 'sources/s1.md' ? null : HASH])));
    const { result } = render(files);

    await waitFor(() => expect(result.current.sources.map((row) => row.state)).toEqual(['compiled', 'unreadable']));
    await act(async () => {});
    expect(native.hash).toHaveBeenCalledTimes(1);
    expect(result.current.pathsNeedingHash).toEqual([]);
  });
});
