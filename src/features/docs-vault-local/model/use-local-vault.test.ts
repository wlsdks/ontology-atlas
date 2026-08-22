import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalVaultBuild, BuiltVaultEntry } from '@/entities/docs-vault';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

/**
 * Risk-path coverage for the vault polling/sync layer (`use-local-vault.ts`).
 *
 * This hook is the only path that can overwrite the user's own markdown. The goal is not full code
 * coverage but coverage of **data-loss scenarios**:
 *
 *  A. IDB handle restore on mount — branching by permission state (auto-load vs waiting)
 *  B. the requestPermission recovery flow
 *  C. saveDoc — VaultConflictError on an expectedMtime conflict, plus the "nothing was written"
 *     guarantee (pinning the phantom-clean regression from persistence.ts at this layer)
 *  D. updateFrontmatter — the same conflict contract
 *  E. refresh() — fingerprint-based poll merging (an unchanged fingerprint skips the rebuild)
 *  F. auto-refresh on tab focus — the path where a poll detects and merges a disk change
 *  G. createDoc / renameDoc — the guard against silently overwriting an existing file
 */

const entitiesMocks = vi.hoisted(() => ({
  buildLocalManifestWithEntries: vi.fn(),
  rebuildLocalManifestIncremental: vi.fn(),
  computeLocalVaultFingerprint: vi.fn(),
}));

vi.mock('@/entities/docs-vault', () => ({
  buildLocalManifestWithEntries: entitiesMocks.buildLocalManifestWithEntries,
  rebuildLocalManifestIncremental: entitiesMocks.rebuildLocalManifestIncremental,
  computeLocalVaultFingerprint: entitiesMocks.computeLocalVaultFingerprint,
  /*
   * `refresh()` calls the variant that returns the fingerprint **and the stamps** (reducing native
   * walks to one per change, 2026-08-09). Every test below drives its scenario through
   * `computeLocalVaultFingerprint`'s return value, so the new function **delegates to it** — that
   * keeps all four existing scenarios (unchanged, changed, failed, polling) steered from one place.
   * Holding a separate value here would let the two mocks diverge into "the test passes while the
   * hook sees something else".
   */
  computeLocalVaultFingerprintWithStamps: async (root: unknown) => ({
    fingerprint: await entitiesMocks.computeLocalVaultFingerprint(root),
    nativeStamps: null,
  }),
}));

const fsHandleMocks = vi.hoisted(() => ({
  getLocalFsHandle: vi.fn(),
  putLocalFsHandle: vi.fn(),
  deleteLocalFsHandle: vi.fn(),
  forgetRecentLocalFsHandle: vi.fn(),
  listRecentLocalFsHandles: vi.fn(),
  touchLocalFsHandle: vi.fn(),
  verifyHandlePermission: vi.fn(),
}));

vi.mock('@/entities/local-fs-handle', () => ({
  CURRENT_LOCAL_FS_HANDLE_ID: 'current',
  getLocalFsHandle: fsHandleMocks.getLocalFsHandle,
  putLocalFsHandle: fsHandleMocks.putLocalFsHandle,
  deleteLocalFsHandle: fsHandleMocks.deleteLocalFsHandle,
  forgetRecentLocalFsHandle: fsHandleMocks.forgetRecentLocalFsHandle,
  listRecentLocalFsHandles: fsHandleMocks.listRecentLocalFsHandles,
  touchLocalFsHandle: fsHandleMocks.touchLocalFsHandle,
  verifyHandlePermission: fsHandleMocks.verifyHandlePermission,
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  // `isSupported()` falls back to the Tauri runtime check when showDirectoryPicker is absent.
  // Pinned true to produce a "supported" state without touching window globals.
  isTauriVaultRuntime: vi.fn(() => true),
  pickTauriVaultDirectory: vi.fn(),
  getTauriVaultRootPath: vi.fn(() => null),
}));

import { useLocalVaultInternal, VaultConflictError } from './use-local-vault';

function emptyManifest() {
  return {
    version: '1',
    generatedAt: '',
    docs: [] as unknown[],
    backlinksDetail: {},
    tags: {},
    tree: { name: 'root', path: '', type: 'dir' as const },
  };
}

function manifestWithDoc(slug: string, frontmatter: Record<string, unknown>): LocalVaultBuild['manifest'] {
  return {
    ...emptyManifest(),
    docs: [
      {
        slug,
        path: `${slug}.md`,
        title: String(frontmatter.title ?? slug),
        description: '',
        tags: [],
        frontmatter,
        headings: [],
        excerpt: '',
        wordCount: 0,
        updatedAt: '',
        linksOut: [],
        mtime: 1000,
      },
    ],
  };
}

function makeBuildResult(
  overrides: Partial<LocalVaultBuild> = {},
): { build: LocalVaultBuild; entries: BuiltVaultEntry[] } {
  const build = {
    manifest: emptyManifest(),
    fileHandles: new Map<string, FileSystemFileHandle>(),
    imageHandles: new Map<string, FileSystemFileHandle>(),
    fingerprint: 'fp-1',
    ...overrides,
  } as LocalVaultBuild;
  return { build, entries: [] };
}

/** The vault root — a minimal stub that deliberately defines neither getFileHandle nor
 * getDirectoryHandle, so sidecar readers (`readAgentConfigStatus` and friends) safely treat it as
 * "no such file". Those paths are already wrapped in try/catch. */
function fakeRootHandle(name = 'vault'): FileSystemDirectoryHandle {
  return { kind: 'directory', name } as unknown as FileSystemDirectoryHandle;
}

/** A fake file handle exposing a write spy — used to verify directly whether anything was actually
 * written to disk. */
function fakeFileHandle(initial: { text: string; lastModified: number }) {
  const state = { ...initial };
  const write = vi.fn(async (data: string) => {
    state.text = data;
  });
  const close = vi.fn(async () => {});
  const createWritable = vi.fn(async () => ({ write, close }));
  const getFile = vi.fn(async () => ({
    text: async () => state.text,
    lastModified: state.lastModified,
  }));
  const handle = {
    kind: 'file',
    name: 'doc.md',
    getFile,
    createWritable,
  } as unknown as FileSystemFileHandle;
  return { handle, write, close, createWritable, getFile, state };
}

function makeRecord(handle: FileSystemDirectoryHandle): LocalFsHandleRecord {
  return {
    id: 'current',
    handle,
    name: handle.name,
    createdAt: 0,
    lastAccessedAt: 0,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  // Reset the defaults for every test, so a test that does not override explicitly never depends on
  // mock residue from the previous one.
  fsHandleMocks.listRecentLocalFsHandles.mockResolvedValue([]);
  fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
});

describe('useLocalVaultInternal — mount 시 핸들 복원', () => {
  it('저장된 핸들이 없으면 idle 로 남고 vault 를 빌드하지 않는다', async () => {
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(null);
    const { result } = renderHook(() => useLocalVaultInternal());

    await waitFor(() => expect(result.current.restoreAttempted).toBe(true));

    expect(result.current.status).toBe('idle');
    expect(entitiesMocks.buildLocalManifestWithEntries).not.toHaveBeenCalled();
  });

  it('권한이 granted 로 복원되면 자동으로 vault 를 로드한다', async () => {
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(makeBuildResult());

    const { result } = renderHook(() => useLocalVaultInternal());

    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(entitiesMocks.buildLocalManifestWithEntries).toHaveBeenCalledTimes(1);
  });

  it('권한이 없으면(prompt/denied) 자동으로 재빌드하지 않고 permission-needed 로 대기한다', async () => {
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('prompt');

    const { result } = renderHook(() => useLocalVaultInternal());

    await waitFor(() => expect(result.current.status).toBe('permission-needed'));
    // The core guard: no disk rebuild (which presumes an implicit write) may happen while permission
    // has not been granted.
    expect(entitiesMocks.buildLocalManifestWithEntries).not.toHaveBeenCalled();
  });
});

describe('useLocalVaultInternal — requestPermission 복구', () => {
  it('재승인이 성공하면 vault 를 로드해 정상 복귀한다', async () => {
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValueOnce('prompt');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(makeBuildResult());

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('permission-needed'));

    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.status).toBe('loaded');
  });

  it('재승인이 거부되면 permission-needed 를 유지하고 조용히 진행하지 않는다', async () => {
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('prompt');

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('permission-needed'));

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.status).toBe('permission-needed');
    expect(entitiesMocks.buildLocalManifestWithEntries).not.toHaveBeenCalled();
  });
});

describe('useLocalVaultInternal — saveDoc conflict 계약 (silent-overwrite 회귀 가드)', () => {
  async function loadedHookWithDoc(fh: ReturnType<typeof fakeFileHandle>) {
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(
      makeBuildResult({
        fileHandles: new Map([['note', fh.handle]]),
      }),
    );
    // After saveDoc succeeds, the follow-up load() takes the incremental path that reuses the
    // previous entries, so that is mocked too.
    entitiesMocks.rebuildLocalManifestIncremental.mockResolvedValue(
      makeBuildResult({
        fingerprint: 'fp-2',
        fileHandles: new Map([['note', fh.handle]]),
      }),
    );

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    return result;
  }

  it('saveDoc도 기존 uid와 merged_uids를 바꾼 전체 문서를 거부한다', async () => {
    const uid = '01890f3e-7b5d-4c0a-8f14-123456789abc';
    const mergedUid = '11890f3e-7b5d-4c0a-8f14-123456789abc';
    const raw = `---\nuid: ${uid}\nmerged_uids: [${mergedUid}]\nkind: project\ntitle: A\n---\n\nbody`;
    const fh = fakeFileHandle({ text: raw, lastModified: 1000 });
    const result = await loadedHookWithDoc(fh);

    await expect(
      act(async () => {
        await result.current.saveDoc(
          'note',
          raw.replace(uid, '21890f3e-7b5d-4c0a-8f14-123456789abc'),
        );
      }),
    ).rejects.toThrow(/uid.*immutable|immutable.*uid/i);
    await expect(
      act(async () => {
        await result.current.saveDoc('note', raw.replace(`merged_uids: [${mergedUid}]\n`, ''));
      }),
    ).rejects.toThrow(/merged_uids.*merge/i);

    expect(fh.write).not.toHaveBeenCalled();
    expect(fh.state.text).toBe(raw);
  });

  it('expectedMtime 이 디스크 mtime 과 일치하면 정상 저장 후 재스캔한다', async () => {
    const fh = fakeFileHandle({ text: 'old', lastModified: 1000 });
    const result = await loadedHookWithDoc(fh);

    await act(async () => {
      await result.current.saveDoc('note', 'new content', { expectedMtime: 1000 });
    });

    expect(fh.write).toHaveBeenCalledWith('new content');
    expect(entitiesMocks.rebuildLocalManifestIncremental).toHaveBeenCalledTimes(1);
  });

  it('expectedMtime 이 디스크 mtime 과 다르면 VaultConflictError 를 던지고 파일을 쓰지 않으며 재스캔도 하지 않는다', async () => {
    // A real bug once: swallowing this conflict leaves the editor buffer phantom-clean, and the next
    // poll's re-fetch silently overwrites the user's unsaved edits (see the comment in
    // src/views/docs-vault/lib/persistence.ts). At this hook's level, the minimum contract is that
    // **no write happens at all**.
    const fh = fakeFileHandle({ text: 'disk content after external edit', lastModified: 2000 });
    const result = await loadedHookWithDoc(fh);

    await expect(
      act(async () => {
        await result.current.saveDoc('note', 'my unsaved edit', { expectedMtime: 1000 });
      }),
    ).rejects.toThrow(VaultConflictError);

    expect(fh.createWritable).not.toHaveBeenCalled();
    expect(fh.write).not.toHaveBeenCalled();
    expect(fh.state.text).toBe('disk content after external edit');
    expect(entitiesMocks.rebuildLocalManifestIncremental).not.toHaveBeenCalled();
    expect(entitiesMocks.buildLocalManifestWithEntries).toHaveBeenCalledTimes(1); // the initial mount load only
  });

  it('핸들이 없는 slug 저장 시도는 에러를 던지고 아무것도 쓰지 않는다', async () => {
    const fh = fakeFileHandle({ text: 'x', lastModified: 1000 });
    const result = await loadedHookWithDoc(fh);

    await expect(
      act(async () => {
        await result.current.saveDoc('does-not-exist', 'y', {});
      }),
    ).rejects.toThrow(/no file handle/);

    expect(fh.write).not.toHaveBeenCalled();
  });
});

describe('useLocalVaultInternal — updateFrontmatter conflict 계약', () => {
  it('UID 없는 legacy 문서는 kind 승격과 함께 한 번만 UID를 초기화할 수 있다', async () => {
    const uid = '01890f3e-7b5d-4c0a-8f14-123456789abc';
    const fh = fakeFileHandle({ text: '# Legacy document\n', lastModified: 1000 });
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(
      makeBuildResult({ fileHandles: new Map([['legacy', fh.handle]]) }),
    );

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await act(async () => {
      await result.current.updateFrontmatter('legacy', {
        uid,
        kind: 'element',
        title: 'Legacy',
      }, { skipRefresh: true });
    });

    expect(fh.state.text).toContain(`uid: ${uid}`);
    expect(fh.state.text).toContain('kind: element');
  });

  it('이미 발급된 uid와 merge history는 generic frontmatter patch로 바꾸지 못한다', async () => {
    const uid = '01890f3e-7b5d-4c0a-8f14-123456789abc';
    const fh = fakeFileHandle({
      text: `---\nuid: ${uid}\nkind: project\ntitle: A\n---\n\nbody`,
      lastModified: 1000,
    });
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(
      makeBuildResult({
        manifest: manifestWithDoc('note', { uid, kind: 'project', title: 'A' }),
        fileHandles: new Map([['note', fh.handle]]),
      }),
    );

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await expect(
      act(async () => {
        await result.current.updateFrontmatter('note', {
          uid: '11890f3e-7b5d-4c0a-8f14-123456789abc',
        });
      }),
    ).rejects.toThrow(/uid.*immutable|immutable.*uid/i);
    await expect(
      act(async () => {
        await result.current.updateFrontmatter('note', {
          merged_uids: ['11890f3e-7b5d-4c0a-8f14-123456789abc'],
        });
      }),
    ).rejects.toThrow(/merged_uids.*merge/i);

    expect(fh.write).not.toHaveBeenCalled();
    expect(fh.state.text).toContain(`uid: ${uid}`);
  });

  it('expectedMtime 충돌 시 VaultConflictError 를 던지고 파일을 쓰지 않는다', async () => {
    const fh = fakeFileHandle({
      text: '---\ntitle: A\n---\n\nbody',
      lastModified: 5000,
    });
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(
      makeBuildResult({ fileHandles: new Map([['note', fh.handle]]) }),
    );

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await expect(
      act(async () => {
        await result.current.updateFrontmatter(
          'note',
          { title: 'B' },
          { expectedMtime: 4000 },
        );
      }),
    ).rejects.toThrow(VaultConflictError);

    expect(fh.createWritable).not.toHaveBeenCalled();
    expect(fh.state.text).toBe('---\ntitle: A\n---\n\nbody');
  });
});

describe('useLocalVaultInternal — refresh() / poll 병합', () => {
  it('fingerprint 가 동일하면 전체 재빌드를 skip 한다 (변경 없음 → 무료 비교만)', async () => {
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(
      makeBuildResult({ fingerprint: 'fp-same' }),
    );
    entitiesMocks.computeLocalVaultFingerprint.mockResolvedValue('fp-same');

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(entitiesMocks.buildLocalManifestWithEntries).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });

    // Only the fingerprint is compared — no rebuild (load) call.
    expect(entitiesMocks.buildLocalManifestWithEntries).toHaveBeenCalledTimes(1);
    expect(entitiesMocks.rebuildLocalManifestIncremental).not.toHaveBeenCalled();
  });

  it('fingerprint 가 바뀌면 refresh 가 전체 재빌드(load)를 수행해 디스크 변경을 병합한다', async () => {
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(
      makeBuildResult({ fingerprint: 'fp-1' }),
    );
    entitiesMocks.rebuildLocalManifestIncremental.mockResolvedValue(
      makeBuildResult({ fingerprint: 'fp-2' }),
    );
    entitiesMocks.computeLocalVaultFingerprint.mockResolvedValue('fp-2');

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await act(async () => {
      await result.current.refresh();
    });

    expect(entitiesMocks.rebuildLocalManifestIncremental).toHaveBeenCalledTimes(1);
  });

  it('fingerprint 계산이 실패하면 안전하게 전체 재빌드로 폴백한다', async () => {
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(makeBuildResult());
    entitiesMocks.rebuildLocalManifestIncremental.mockResolvedValue(makeBuildResult());
    entitiesMocks.computeLocalVaultFingerprint.mockRejectedValue(new Error('fs error'));

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await act(async () => {
      await result.current.refresh();
    });

    expect(entitiesMocks.rebuildLocalManifestIncremental).toHaveBeenCalledTimes(1);
  });
});

describe('useLocalVaultInternal — 탭 focus 복귀 auto-refresh (poll → 병합 경로)', () => {
  it('focus 복귀 시 fingerprint 변경이 감지되면 자동으로 재로드한다', async () => {
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(
      makeBuildResult({ fingerprint: 'fp-1' }),
    );
    entitiesMocks.rebuildLocalManifestIncremental.mockResolvedValue(
      makeBuildResult({ fingerprint: 'fp-2' }),
    );
    entitiesMocks.computeLocalVaultFingerprint.mockResolvedValue('fp-2');

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(entitiesMocks.buildLocalManifestWithEntries).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      // The fingerprint comparison and the conditional load() inside fire() are all microtask and
      // promise chains, so they are flushed.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(entitiesMocks.rebuildLocalManifestIncremental).toHaveBeenCalledTimes(1),
    );
  });
});

describe('useLocalVaultInternal — 기존 파일 보호 (createDoc / renameDoc)', () => {
  it('createDoc: kind 노드는 유효한 uid 없이 디스크에 쓰지 않는다', async () => {
    const created = fakeFileHandle({ text: '', lastModified: 0 });
    const getFileHandle = vi.fn(async (_name: string, options?: { create?: boolean }) => {
      if (options?.create) return created.handle;
      throw new DOMException('missing', 'NotFoundError');
    });
    const root = {
      kind: 'directory',
      name: 'my-vault',
      getFileHandle,
    } as unknown as FileSystemDirectoryHandle;
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(makeBuildResult());

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await expect(
      act(async () => {
        await result.current.createDoc('new', '---\nkind: project\ntitle: Missing UID\n---\n');
      }),
    ).rejects.toThrow(/uid/i);

    expect(created.write).not.toHaveBeenCalled();
  });

  it('createDoc: 기존 primary/merged UID와 충돌하는 새 노드를 쓰지 않는다', async () => {
    const uid = '01890f3e-7b5d-4c0a-8f14-123456789abc';
    const mergedUid = '11890f3e-7b5d-4c0a-8f14-123456789abc';
    const created = fakeFileHandle({ text: '', lastModified: 0 });
    const getFileHandle = vi.fn(async (_name: string, options?: { create?: boolean }) => {
      if (options?.create) return created.handle;
      throw new DOMException('missing', 'NotFoundError');
    });
    const root = {
      kind: 'directory',
      name: 'my-vault',
      getFileHandle,
    } as unknown as FileSystemDirectoryHandle;
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(
      makeBuildResult({
        manifest: manifestWithDoc('existing', {
          uid,
          merged_uids: [mergedUid],
          kind: 'project',
          title: 'Existing',
        }),
      }),
    );

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await expect(
      act(async () => {
        await result.current.createDoc(
          'new',
          `---\nuid: ${uid}\nkind: project\ntitle: Duplicate\n---\n`,
        );
      }),
    ).rejects.toThrow(/UID collision.*existing/i);

    await expect(
      act(async () => {
        await result.current.createDoc(
          'new-from-absorbed-id',
          `---\nuid: 21890f3e-7b5d-4c0a-8f14-123456789abc\nmerged_uids: [${mergedUid}]\nkind: project\ntitle: Duplicate absorbed identity\n---\n`,
        );
      }),
    ).rejects.toThrow(/UID collision.*existing/i);

    expect(created.write).not.toHaveBeenCalled();
  });

  it('createDoc: 로드 뒤 외부에서 생긴 동일 slug도 다시 확인해 덮어쓰지 않는다', async () => {
    const external = fakeFileHandle({
      text: '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nkind: project\ntitle: External\n---\n',
      lastModified: 2000,
    });
    const getFileHandle = vi.fn(async (name: string) => {
      if (name === 'new.md') return external.handle;
      throw new DOMException('missing', 'NotFoundError');
    });
    const root = {
      kind: 'directory',
      name: 'my-vault',
      getFileHandle,
    } as unknown as FileSystemDirectoryHandle;
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(makeBuildResult());

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await expect(
      act(async () => {
        await result.current.createDoc(
          'new',
          '---\nuid: 11890f3e-7b5d-4c0a-8f14-123456789abc\nkind: project\ntitle: New\n---\n',
        );
      }),
    ).rejects.toThrow(/already exists/);

    expect(external.write).not.toHaveBeenCalled();
    expect(external.state.text).toContain('title: External');
  });

  it('createDoc: 이미 존재하는 slug 면 기존 파일을 덮어쓰지 않고 에러를 던진다', async () => {
    const fh = fakeFileHandle({ text: 'existing', lastModified: 1000 });
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(
      makeBuildResult({ fileHandles: new Map([['note', fh.handle]]) }),
    );

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await expect(
      act(async () => {
        await result.current.createDoc('note', 'new doc content');
      }),
    ).rejects.toThrow(/already exists/);

    expect(fh.write).not.toHaveBeenCalled();
    expect(fh.state.text).toBe('existing');
  });

  it('renameDoc: 새 slug 가 이미 존재하면 덮어쓰지 않고 에러를 던진다', async () => {
    const target = fakeFileHandle({ text: 'target content', lastModified: 1000 });
    const source = fakeFileHandle({ text: 'source content', lastModified: 1000 });
    const root = fakeRootHandle('my-vault');
    fsHandleMocks.getLocalFsHandle.mockResolvedValue(makeRecord(root));
    fsHandleMocks.verifyHandlePermission.mockResolvedValue('granted');
    entitiesMocks.buildLocalManifestWithEntries.mockResolvedValue(
      makeBuildResult({
        fileHandles: new Map([
          ['a', source.handle],
          ['b', target.handle],
        ]),
      }),
    );

    const { result } = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await expect(
      act(async () => {
        await result.current.renameDoc('a', 'b');
      }),
    ).rejects.toThrow(/already exists/);

    expect(target.write).not.toHaveBeenCalled();
    expect(target.state.text).toBe('target content');
  });
});
