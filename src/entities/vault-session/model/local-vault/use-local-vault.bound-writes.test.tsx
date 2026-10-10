import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

const tauri = vi.hoisted(() => ({
  isTauriVaultRuntime: vi.fn(() => true),
  tauriVaultPathExists: vi.fn(async () => true),
  listTauriDirectoryNames: vi.fn(async () => [] as string[]),
  getTauriVaultRootPath: vi.fn((h: { rootPath?: string }) => h?.rootPath),
  createTauriVaultHandle: vi.fn(),
  pickTauriVaultDirectory: vi.fn(),
}));

const store = vi.hoisted(() => ({
  getLocalFsHandle: vi.fn(async () => undefined),
  listRecentLocalFsHandles: vi.fn(async () => []),
  putLocalFsHandle: vi.fn(async () => {}),
  touchLocalFsHandle: vi.fn(async () => {}),
  forgetRecentLocalFsHandle: vi.fn(async () => {}),
  deleteLocalFsHandle: vi.fn(async () => {}),
  verifyHandlePermission: vi.fn(async () => 'granted' as PermissionState),
}));

const docsVault = vi.hoisted(() => ({
  buildLocalManifestWithEntries: vi.fn(async () => ({
    build: {
      manifest: { version: '1', generatedAt: '', docs: [], backlinksDetail: {}, tags: {}, tree: { name: 'root', path: '', type: 'dir' as const } },
      fileHandles: new Map(),
      imageHandles: new Map(),
      fingerprint: 'fp',
    },
    entries: [],
  })),
  rebuildLocalManifestIncremental: vi.fn(),
  computeLocalVaultFingerprint: vi.fn(async () => 'fp'),
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => tauri);
vi.mock('@/entities/local-fs-handle', () => ({ CURRENT_LOCAL_FS_HANDLE_ID: 'current', ...store }));
vi.mock('@/entities/docs-vault', () => docsVault);

import { useLocalVaultInternal } from './use-local-vault';

function notFound(): Error {
  return Object.assign(new Error('not found'), { name: 'NotFoundError' });
}

function folder(rootPath: string, written: Map<string, string>): LocalFsHandleRecord {
  const handle = {
    kind: 'directory',
    name: rootPath.split('/').pop(),
    rootPath,
    getDirectoryHandle: async () => {
      throw notFound();
    },
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      if (!written.has(name) && !options?.create) throw notFound();
      return {
        createWritable: async () => ({
          write: async (content: string) => void written.set(name, content),
          close: async () => {},
        }),
      };
    },
  } as unknown as FileSystemDirectoryHandle;
  return { id: 'current', handle, desktopRootPath: rootPath, name: rootPath, createdAt: 1, lastAccessedAt: 1 };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useLocalVaultInternal writes', () => {
  it('refuses a write made for a folder that is no longer open, and writes nowhere', async () => {
    const inA = new Map<string, string>();
    const inB = new Map<string, string>();
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));

    await act(async () => {
      await hook.result.current.openRecent(folder('/vaults/a', inA));
    });
    const madeForA = hook.result.current;
    await act(async () => {
      await hook.result.current.openRecent(folder('/vaults/b', inB));
    });

    await expect(madeForA.createDoc('note', '# Note\n')).rejects.toThrow(/no longer open/);
    await expect(madeForA.deleteDoc('note')).rejects.toThrow(/no longer open/);
    await expect(madeForA.updateFrontmatter('note', { title: 'Note' })).rejects.toThrow(/no longer open/);
    expect([...inA.keys(), ...inB.keys()]).toEqual([]);

    await act(async () => {
      await hook.result.current.createDoc('note', '# Note\n');
    });
    expect([...inB.keys()]).toEqual(['note.md']);
    expect([...inA.keys()]).toEqual([]);
  });
});
