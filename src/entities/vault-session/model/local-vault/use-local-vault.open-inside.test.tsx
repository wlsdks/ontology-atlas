import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The **wiring** behind "picking a project opens the map inside it".
 *
 * ⚠️ `resolve-picked-vault-folder.test.ts` already holds the rule itself, but a correct rule nobody
 * calls changes nothing. This file covers the part that was untested when the feature shipped: that
 * `open()` actually consults it, opens the folder it names, registers **that** folder as the vault,
 * and reports the substitution so a screen can say so.
 *
 * Everything here is deliberately at the seam. It mocks the desktop bridge rather than the resolver,
 * so a regression that stopped calling the resolver — or called it and ignored the answer — fails
 * here rather than passing on the strength of the pure test next door.
 */

const mocks = vi.hoisted(() => ({
  /** What the native picker hands back — the folder the person actually chose. */
  pickedPath: '/Users/dana/my-product' as string | null,
  /** Directory listings by absolute path; a missing key means "not a directory". */
  listings: {} as Record<string, string[]>,
  /** Every handle `createTauriVaultHandle` was asked to build, in order. */
  createdHandles: [] as string[],
  putRecords: [] as Array<{ name: string; desktopRootPath?: string }>,
}));

vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-files', () => ({
  listTauriDirectoryNames: async (rootPath: string) => {
    const names = mocks.listings[rootPath];
    if (!names) throw new Error(`not a directory: ${rootPath}`);
    return names;
  },
  tauriVaultPathExists: async () => true,
}));
vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-handle', () => ({
  createTauriVaultHandle: (rootPath: string) => {
    mocks.createdHandles.push(rootPath);
    return { name: rootPath };
  },
}));
vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-location', () => ({
  pickTauriVaultDirectory: async () =>
    mocks.pickedPath === null ? null : { name: 'picked', __picked: true },
  vaultRootRejectionReason: () => null,
}));
vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-runtime', () => ({
  getTauriVaultRootPath: (handle: { __picked?: boolean; name?: string } | null) =>
    handle?.__picked ? mocks.pickedPath : (handle?.name ?? null),
}));

vi.mock('@/entities/local-fs-handle', async () => {
  const actual =
    await vi.importActual<typeof import('@/entities/local-fs-handle')>('@/entities/local-fs-handle');
  return {
    ...actual,
    putLocalFsHandle: async (record: { name: string; desktopRootPath?: string }) => {
      mocks.putRecords.push(record);
    },
    getLocalFsHandle: async () => null,
    listRecentLocalFsHandles: async () => [],
    deleteLocalFsHandle: async () => {},
    forgetRecentLocalFsHandle: async () => {},
    touchLocalFsHandle: async () => {},
  };
});

import { useLocalVaultInternal } from './use-local-vault';

const MAP_FILES = ['orders.md', 'billing.md'];

beforeEach(() => {
  mocks.pickedPath = '/Users/dana/my-product';
  mocks.listings = {};
  mocks.createdHandles = [];
  mocks.putRecords = [];
});

describe('opening a folder: a person who picked a project expects the map inside it', () => {
  it('registers the map inside a project as the vault and says it opened a different folder', async () => {
    mocks.listings['/Users/dana/my-product/atlas'] = MAP_FILES;
    const { result } = renderHook(() => useLocalVaultInternal());

    await act(async () => {
      await result.current.open();
    });

    // The handle built for the vault is the folder inside, not the one the picker returned.
    expect(
      mocks.createdHandles,
      'opened the picked folder as is even after computing the redirect',
    ).toContain('/Users/dana/my-product/atlas');
    // ⚠️ Registration matters as much as opening: whatever lands here is what reopens next session
    // and what later writes are relative to.
    const registered = mocks.putRecords.at(-1);
    expect(registered?.name).toBe('/Users/dana/my-product/atlas');

    await waitFor(() =>
      expect(
        result.current.openedInsidePickedFolder,
        'silently opening another folder would not do what the product was told',
      ).toBe('/Users/dana/my-product'),
    );
  });

  it('opens the picked folder as is and gives no notice when there is no map inside', async () => {
    // No `atlas` listing at all — the picked folder is the vault on its own terms.
    const { result } = renderHook(() => useLocalVaultInternal());

    await act(async () => {
      await result.current.open();
    });

    expect(mocks.createdHandles).not.toContain('/Users/dana/my-product/atlas');
    expect(
      result.current.openedInsidePickedFolder,
      'saying it opened another folder when it did not would leave nobody trusting that notice',
    ).toBeNull();
  });

  it('does not switch to a source folder that merely shares the name', async () => {
    mocks.listings['/Users/dana/my-product/atlas'] = ['index.ts', 'render.ts'];
    const { result } = renderHook(() => useLocalVaultInternal());

    await act(async () => {
      await result.current.open();
    });

    expect(
      mocks.createdHandles,
      'opening a source folder as a vault shows an empty map and nobody can tell why',
    ).not.toContain('/Users/dana/my-product/atlas');
    expect(result.current.openedInsidePickedFolder).toBeNull();
  });

  it('registers nothing for a cancelled picker', async () => {
    mocks.pickedPath = null;
    const { result } = renderHook(() => useLocalVaultInternal());

    await act(async () => {
      await result.current.open();
    });

    expect(mocks.putRecords, 'remembered as a vault a folder nobody picked').toHaveLength(0);
    expect(result.current.openedInsidePickedFolder).toBeNull();
  });
});
