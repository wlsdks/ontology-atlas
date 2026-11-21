import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultDoc, VaultSourceFile } from '@/entities/docs-vault';

import { SOURCE_HASH_CHUNK, SOURCE_HASH_PUBLISH_MS, useLibraryModel } from './use-library-model';

const native = vi.hoisted(() => ({ hash: vi.fn(), readMany: vi.fn(), readOne: vi.fn() }));
vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', () => ({
  nativeVaultFileHashResults: native.hash,
  readTauriVaultTextFiles: native.readMany,
  readTauriVaultTextFile: native.readOne,
}));

const HASH = 'a'.repeat(64);
const PAGES = ['wiki/a', 'wiki/b', 'wiki/c'];
/** A sentence only the page body holds: no fact, summary or term the Library keeps repeats it. */
const BODY_ONLY = 'The quarry ledger stays in the north annex.';

const SOURCES: VaultSourceFile[] = Array.from({ length: 3 * SOURCE_HASH_CHUNK }, (_, index) => ({
  path: `sources/s${index}.md`, name: `s${index}.md`, format: 'md', bytes: 1, mtime: 1,
}));

/** The first three pages each cite a third of the sources with a recorded hash, so every source needs measuring. */
function pageDoc(slug: string, at: number, mtime = 1): VaultDoc {
  const cited = SOURCES.slice(at * SOURCE_HASH_CHUNK, (at + 1) * SOURCE_HASH_CHUNK).map(({ path }) => path);
  return {
    slug, path: `${slug}.md`, title: slug, tags: [], linksOut: [],
    updatedAt: '', mtime,
    frontmatter: { sources: cited, source_hash: Object.fromEntries(cited.map((path) => [path, HASH])) },
  };
}

const pageText = (slug: string) =>
  `---\ntitle: ${slug}\n---\n## Summary\nWhat ${slug} says.\n## Facts\n- ${slug} holds a fact.\n## Open questions\n${BODY_ONLY}\n`;

/** Native batch reads stay open until the test releases them, so hash results land mid-read. */
function heldPageReads() {
  const reads = new Map<string, number>();
  const open: Array<() => void> = [];
  native.readMany.mockImplementation((_root: string, paths: string[]) => {
    for (const path of paths) reads.set(path, (reads.get(path) ?? 0) + 1);
    return new Promise((resolve) => open.push(() => resolve(paths.map((relativePath) => ({
      relativePath, text: pageText(relativePath.replace(/\.md$/, '')), lastModified: 1, error: null,
    })))));
  });
  return { reads, open };
}

type Pending = Array<{ paths: string[]; resolve: (value: Map<string, string | null>) => void }>;

function heldHashCalls(): Pending {
  const pending: Pending = [];
  native.hash.mockImplementation((_root: string, paths: string[]) =>
    new Promise((resolve) => pending.push({ paths, resolve })));
  return pending;
}

const answer = (call: Pending[number]) => call.resolve(new Map(call.paths.map((path) => [path, HASH])));

function inputFor(slugs: readonly string[], mtimeOf: (slug: string) => number = () => 1) {
  return {
    docs: slugs.map((slug, at) => pageDoc(slug, at, mtimeOf(slug))), sources: SOURCES, sourceHandles: new Map(),
    // The walk's handles say which pages the folder granted; the app reads them natively.
    fileHandles: new Map(slugs.map((slug) => [slug, {} as FileSystemFileHandle])),
    vaultRootPath: '/vault', vaultScope: 'app:/vault', enabled: true,
  };
}

const render = (slugs: readonly string[] = PAGES) => renderHook((props) => useLibraryModel(props), { initialProps: inputFor(slugs) });

async function releaseAll(open: Array<() => void>) {
  while (open.length > 0) await act(async () => open.shift()!());
}

/** Every string reachable from `value` through objects, arrays, maps and sets. */
function reachableStrings(value: unknown, seen = new Set<unknown>(), out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  const children = value instanceof Map ? [...value.keys(), ...value.values()]
    : value instanceof Set ? [...value] : Object.values(value);
  for (const child of children) reachableStrings(child, seen, out);
  return out;
}

beforeEach(() => {
  native.hash.mockReset();
  native.readMany.mockReset();
  native.readOne.mockReset();
  let now = 0;
  // Every reading of the clock is a publish interval later, so each finished chunk publishes.
  vi.spyOn(performance, 'now').mockImplementation(() => (now += SOURCE_HASH_PUBLISH_MS));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('wiki pages while source hashes arrive', () => {
  it('reads each page once although hash results are published during the reads', async () => {
    const hashes = heldHashCalls();
    const pages = heldPageReads();
    const { result } = render();

    await waitFor(() => expect(hashes).toHaveLength(1));
    await waitFor(() => expect(pages.open).toHaveLength(1));
    await act(async () => answer(hashes[0]));
    await act(async () => answer(hashes[1]));
    await releaseAll(pages.open);
    await act(async () => answer(hashes[2]));
    await releaseAll(pages.open);

    await waitFor(() => expect(result.current.pageFacts.size).toBe(PAGES.length));
    expect(Object.fromEntries(pages.reads)).toEqual({ 'wiki/a.md': 1, 'wiki/b.md': 1, 'wiki/c.md': 1 });
  });

  it('shows the pages of a finished read before the next read arrives', async () => {
    heldHashCalls();
    const pages = heldPageReads();
    const slugs = Array.from({ length: 70 }, (_, index) => `wiki/p${index}`);
    const { result } = render(slugs);

    await waitFor(() => expect(pages.open).toHaveLength(1));
    await act(async () => pages.open.shift()!());
    await waitFor(() => expect(pages.open).toHaveLength(1));

    expect(result.current.pageFacts.size).toBeGreaterThan(0);
    expect(result.current.pageFacts.size).toBeLessThan(slugs.length);
  });

  it('rereads only the page whose version changed, and none on a rebuilt listing', async () => {
    heldHashCalls();
    const pages = heldPageReads();
    const { result, rerender } = render();
    await releaseAll(pages.open);
    await waitFor(() => expect(result.current.pageFacts.size).toBe(PAGES.length));

    rerender(inputFor(PAGES));
    await act(async () => {});
    expect(native.readMany).toHaveBeenCalledTimes(1);

    rerender(inputFor(PAGES, (slug) => (slug === 'wiki/b' ? 2 : 1)));
    await waitFor(() => expect(pages.open).toHaveLength(1));
    await releaseAll(pages.open);
    await waitFor(() => expect(result.current.pageFacts.size).toBe(PAGES.length));
    expect(Object.fromEntries(pages.reads)).toEqual({ 'wiki/a.md': 1, 'wiki/b.md': 2, 'wiki/c.md': 1 });
  });

  it('keeps no page text once the page has been read', async () => {
    heldHashCalls();
    const pages = heldPageReads();
    const { result } = render();
    await releaseAll(pages.open);
    await waitFor(() => expect(result.current.pageFacts.size).toBe(PAGES.length));

    const kept = reachableStrings(result.current);
    expect(kept.length, 'the scan reached no string').toBeGreaterThan(PAGES.length);
    expect(kept.filter((text) => text.includes(BODY_ONLY))).toEqual([]);
    expect(kept.filter((text) => PAGES.some((slug) => text === pageText(slug)))).toEqual([]);
  });
});
