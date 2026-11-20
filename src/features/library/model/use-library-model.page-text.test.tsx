import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultDoc, VaultSourceFile } from '@/entities/docs-vault';

import { SOURCE_HASH_CHUNK, SOURCE_HASH_PUBLISH_MS, useLibraryModel } from './use-library-model';

const native = vi.hoisted(() => ({ hash: vi.fn() }));
vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', () => ({
  nativeVaultFileHashResults: native.hash,
}));

const HASH = 'a'.repeat(64);
const PAGES = ['wiki/a', 'wiki/b', 'wiki/c'];

const SOURCES: VaultSourceFile[] = Array.from({ length: 3 * SOURCE_HASH_CHUNK }, (_, index) => ({
  path: `sources/s${index}.md`, name: `s${index}.md`, format: 'md', bytes: 1, mtime: 1,
}));

/** Each page cites a third of the sources with a recorded hash, so every source needs measuring. */
function pageDoc(slug: string, at: number): VaultDoc {
  const cited = SOURCES.slice(at * SOURCE_HASH_CHUNK, (at + 1) * SOURCE_HASH_CHUNK).map(({ path }) => path);
  return {
    slug, path: `${slug}.md`, title: slug, tags: [], linksOut: [],
    updatedAt: '', mtime: 1,
    frontmatter: { sources: cited, source_hash: Object.fromEntries(cited.map((path) => [path, HASH])) },
  };
}

/** Page reads stay open until the test releases them, so hash results land mid-read. */
function heldPageReads() {
  const reads = new Map<string, number>();
  const open: Array<() => void> = [];
  const handles = new Map(PAGES.map((slug) => [slug, {
    getFile: async () => {
      reads.set(slug, (reads.get(slug) ?? 0) + 1);
      return { text: () => new Promise<string>((resolve) => open.push(() => resolve(`# ${slug}\n`))) };
    },
  } as unknown as FileSystemFileHandle]));
  return { reads, open, handles };
}

type Pending = Array<{ paths: string[]; resolve: (value: Map<string, string | null>) => void }>;

function heldHashCalls(): Pending {
  const pending: Pending = [];
  native.hash.mockImplementation((_root: string, paths: string[]) =>
    new Promise((resolve) => pending.push({ paths, resolve })));
  return pending;
}

const answer = (call: Pending[number]) => call.resolve(new Map(call.paths.map((path) => [path, HASH])));

function render(fileHandles: Map<string, FileSystemFileHandle>) {
  const input = {
    docs: PAGES.map(pageDoc), sources: SOURCES, sourceHandles: new Map(), fileHandles,
    vaultRootPath: '/vault', vaultScope: 'app:/vault', enabled: true,
  };
  return renderHook(() => useLibraryModel(input));
}

beforeEach(() => {
  native.hash.mockReset();
  let now = 0;
  // Every reading of the clock is a publish interval later, so each finished chunk publishes.
  vi.spyOn(performance, 'now').mockImplementation(() => (now += SOURCE_HASH_PUBLISH_MS));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('wiki page text while source hashes arrive', () => {
  it('reads each page once although hash results are published during the reads', async () => {
    const hashes = heldHashCalls();
    const pages = heldPageReads();
    const { result } = render(pages.handles);

    await waitFor(() => expect(hashes).toHaveLength(1));
    await waitFor(() => expect(pages.open).toHaveLength(1));
    await act(async () => answer(hashes[0]));
    await act(async () => answer(hashes[1]));
    while (pages.open.length > 0) await act(async () => pages.open.shift()!());
    await act(async () => answer(hashes[2]));
    while (pages.open.length > 0) await act(async () => pages.open.shift()!());

    await waitFor(() => expect(result.current.pageTexts.size).toBe(PAGES.length));
    expect(Object.fromEntries(pages.reads)).toEqual({ 'wiki/a': 1, 'wiki/b': 1, 'wiki/c': 1 });
  });

  it('shows the pages already read before the last one arrives', async () => {
    heldHashCalls();
    const pages = heldPageReads();
    const { result } = render(pages.handles);

    await waitFor(() => expect(pages.open).toHaveLength(1));
    await act(async () => pages.open.shift()!());
    await waitFor(() => expect(pages.open).toHaveLength(1));

    expect([...result.current.pageTexts.keys()]).toEqual(['wiki/a']);
  });
});
