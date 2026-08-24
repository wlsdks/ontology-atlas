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

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  isTauriVaultRuntime: () => true,
  pickTauriVaultDirectory: async () =>
    mocks.pickedPath === null ? null : { name: 'picked', __picked: true },
  getTauriVaultRootPath: (handle: { __picked?: boolean; name?: string } | null) =>
    handle?.__picked ? mocks.pickedPath : (handle?.name ?? null),
  createTauriVaultHandle: (rootPath: string) => {
    mocks.createdHandles.push(rootPath);
    return { name: rootPath };
  },
  listTauriDirectoryNames: async (rootPath: string) => {
    const names = mocks.listings[rootPath];
    if (!names) throw new Error(`not a directory: ${rootPath}`);
    return names;
  },
  vaultRootRejectionReason: () => null,
  tauriVaultPathExists: async () => true,
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

describe('폴더 열기 — 프로젝트를 고른 사람은 그 안의 지도를 기대한다', () => {
  it('프로젝트 안에 지도가 있으면 그 지도를 금고로 등록하고, 바꿔 열었다고 알린다', async () => {
    mocks.listings['/Users/dana/my-product/atlas'] = MAP_FILES;
    const { result } = renderHook(() => useLocalVaultInternal());

    await act(async () => {
      await result.current.open();
    });

    // The handle built for the vault is the folder inside, not the one the picker returned.
    expect(
      mocks.createdHandles,
      '리다이렉트를 계산하고도 고른 폴더를 그대로 열었다',
    ).toContain('/Users/dana/my-product/atlas');
    // ⚠️ Registration matters as much as opening: whatever lands here is what reopens next session
    // and what later writes are relative to.
    const registered = mocks.putRecords.at(-1);
    expect(registered?.name).toBe('/Users/dana/my-product/atlas');

    await waitFor(() =>
      expect(
        result.current.openedInsidePickedFolder,
        '말없이 딴 폴더를 열면 제품이 시킨 대로 안 한 것이다',
      ).toBe('/Users/dana/my-product'),
    );
  });

  it('안에 지도가 없으면 고른 폴더를 그대로 열고, 알림도 없다', async () => {
    // No `atlas` listing at all — the picked folder is the vault on its own terms.
    const { result } = renderHook(() => useLocalVaultInternal());

    await act(async () => {
      await result.current.open();
    });

    expect(mocks.createdHandles).not.toContain('/Users/dana/my-product/atlas');
    expect(
      result.current.openedInsidePickedFolder,
      '바꿔 열지도 않았는데 바꿨다고 말하면 그 알림을 아무도 안 믿게 된다',
    ).toBeNull();
  });

  it('이름만 같은 소스 폴더로는 바꿔 열지 않는다', async () => {
    mocks.listings['/Users/dana/my-product/atlas'] = ['index.ts', 'render.ts'];
    const { result } = renderHook(() => useLocalVaultInternal());

    await act(async () => {
      await result.current.open();
    });

    expect(
      mocks.createdHandles,
      '소스 폴더를 금고로 열면 텅 빈 지도가 뜨고, 사람은 이유를 알 길이 없다',
    ).not.toContain('/Users/dana/my-product/atlas');
    expect(result.current.openedInsidePickedFolder).toBeNull();
  });

  it('취소한 피커는 아무것도 등록하지 않는다', async () => {
    mocks.pickedPath = null;
    const { result } = renderHook(() => useLocalVaultInternal());

    await act(async () => {
      await result.current.open();
    });

    expect(mocks.putRecords, '아무도 고르지 않은 폴더를 금고로 기억했다').toHaveLength(0);
    expect(result.current.openedInsidePickedFolder).toBeNull();
  });
});
