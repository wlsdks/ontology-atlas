import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { VaultDoc } from '@/entities/docs-vault';

const bridge = vi.hoisted(() => ({
  available: true,
  search: vi.fn(),
  status: vi.fn(),
  updated: [] as Array<() => void>,
}));

vi.mock('@/entities/vault-session', () => ({
  useLocalVault: () => ({ handle: { rootPath: '/vault' } }),
}));
vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', () => ({
  getTauriVaultRootPath: (handle: { rootPath: string }) => handle.rootPath,
}));
vi.mock('@/shared/lib/vault-folder/vault-index/tauri-vault-index', () => ({
  isVaultIndexAvailable: () => bridge.available,
  onVaultIndexUpdated: async (onUpdate: () => void) => {
    bridge.updated.push(onUpdate);
    return () => undefined;
  },
  searchVaultIndex: bridge.search,
  vaultIndexStatus: bridge.status,
  vaultIndexPreference: { use: () => 'on' },
}));

import { hitEntry, useVaultTextSearch } from './use-vault-text-search';

function doc(slug: string): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title: slug,
    tags: [],
    frontmatter: {},
    updatedAt: '2026-01-01T00:00:00.000Z',
    linksOut: [],
    mtime: 1,
  };
}

const ready = { state: 'ready', indexed: 2, total: 2, sizeBytes: 1, allBytes: 1, vaults: 1 };

afterEach(() => {
  bridge.available = true;
  bridge.search.mockReset();
  bridge.status.mockReset();
  bridge.updated = [];
});

describe('useVaultTextSearch', () => {
  it('gives the hit documents their text and leaves the rest to titles', async () => {
    bridge.status.mockResolvedValue(ready);
    bridge.search.mockResolvedValue({ hits: [{ path: 'wiki/b.md', rank: -2 }, { path: 'gone.md', rank: -1 }], status: ready });
    const getDocContent = vi.fn(async () => '---\ntitle: B\n---\n지도를 읽는다');
    const docs = [doc('wiki/a'), doc('wiki/b')];
    const { result } = renderHook(() => useVaultTextSearch({ query: ' 지도 ', docs, getDocContent }));

    await waitFor(() => expect(result.current.bodyIndex?.size).toBe(1));
    expect(bridge.search).toHaveBeenCalledWith('/vault', '지도', 15);
    expect(getDocContent).toHaveBeenCalledWith('wiki/b');
    expect(result.current.bodyIndex?.get('wiki/b')?.raw).toBe('지도를 읽는다');
    expect(result.current.status).toEqual(ready);
  });

  it('asks again when a pass indexes an edit, without the document list changing', async () => {
    bridge.status.mockResolvedValue(ready);
    bridge.search.mockResolvedValue({ hits: [], status: ready });
    const getDocContent = vi.fn(async () => 'fernbrake');
    const docs = [doc('wiki/a')];
    const { result } = renderHook(() => useVaultTextSearch({ query: 'fernbrake', docs, getDocContent }));
    await waitFor(() => expect(result.current.bodyIndex?.size).toBe(0));

    bridge.search.mockResolvedValue({ hits: [{ path: 'wiki/a.md', rank: -1 }], status: ready });
    await waitFor(() => expect(bridge.updated.length).toBeGreaterThan(0));
    act(() => bridge.updated.forEach((onUpdate) => onUpdate()));

    await waitFor(() => expect(result.current.bodyIndex?.get('wiki/a')?.raw).toBe('fernbrake'));
  });

  it('answers nothing on the web', async () => {
    bridge.available = false;
    const { result } = renderHook(() => useVaultTextSearch({ query: '지도', docs: [doc('a')], getDocContent: vi.fn() }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(result.current).toEqual({ bodyIndex: undefined, status: null });
    expect(bridge.search).not.toHaveBeenCalled();
  });
});

describe('hitEntry', () => {
  it('shows a frontmatter line when the term is only there', () => {
    const text = '---\ndomain: [domains/search]\n---\nBody without it.';
    expect(hitEntry(text, 'k', 'domains/search').raw).toBe(text);
    expect(hitEntry(text, 'k', 'body').raw).toBe('Body without it.');
  });
});
