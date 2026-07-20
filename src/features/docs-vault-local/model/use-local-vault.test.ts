import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalVaultBuild, BuiltVaultEntry } from '@/entities/docs-vault';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

/**
 * 위험 경로 커버리지 — vault 폴링/동기화 계층 (`use-local-vault.ts`).
 *
 * 이 훅은 사용자 원본 마크다운을 덮어쓸 수 있는 유일한 경로다. 목표는 전체
 * 코드 경로 커버리지가 아니라 **데이터 손실 시나리오** 커버리지:
 *
 *  A. mount 시 IDB 핸들 복원 — 권한 상태별 분기 (자동 로드 vs 대기)
 *  B. requestPermission 복구 흐름
 *  C. saveDoc — expectedMtime 충돌 시 VaultConflictError + "쓰지 않음" 보증
 *     (persistence.ts 주석의 phantom-clean 회귀를 이 계층에서 고정)
 *  D. updateFrontmatter — 같은 충돌 계약
 *  E. refresh() — fingerprint 비교 기반 poll 병합 (변경 없으면 재빌드 skip)
 *  F. 탭 focus 복귀 auto-refresh — poll 이 디스크 변경을 감지해 병합하는 경로
 *  G. createDoc / renameDoc — 기존 파일 존재 시 silent overwrite 방지 가드
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
  // isSupported() 는 showDirectoryPicker 부재 시 Tauri 런타임 여부로 판정한다.
  // window 전역을 건드리지 않고 "지원됨" 상태를 만들기 위해 true 고정.
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

/** vault root — sidecar reader (readAgentConfigStatus 등) 가 안전하게
 * "파일 없음" 으로 취급하도록 getFileHandle/getDirectoryHandle 을 아예
 * 정의하지 않은 최소 stub. 그 경로들은 이미 try/catch 로 감싸져 있다. */
function fakeRootHandle(name = 'vault'): FileSystemDirectoryHandle {
  return { kind: 'directory', name } as unknown as FileSystemDirectoryHandle;
}

/** write 스파이를 노출하는 fake file handle — "실제로 디스크에 쓰였는가" 를
 * 직접 검증하기 위한 것. */
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
  // 매 테스트 기본값 재설정 — 명시적으로 override 하지 않는 테스트가
  // 이전 테스트의 mock 잔여 상태에 기대지 않도록.
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
    // 핵심 가드: 권한 미승인 상태에서 디스크 재빌드(=암묵적 쓰기 전제)가
    // 일어나면 안 된다.
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
    // saveDoc 성공 후 load() 가 다시 돌 때는 직전 entries 를 재사용하는
    // incremental 경로를 타므로 함께 mock.
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
    // 과거 실제 버그: 이 conflict 를 swallow 하면 에디터 버퍼가
    // phantom-clean 되고, 다음 poll re-fetch 가 사용자의 미저장 편집을
    // silent overwrite 한다 (src/views/docs-vault/lib/persistence.ts 주석).
    // 이 훅 레벨에서는 "쓰기 자체가 절대 일어나지 않아야 한다" 가 최소 계약.
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
    expect(entitiesMocks.buildLocalManifestWithEntries).toHaveBeenCalledTimes(1); // 최초 mount load 만
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

    // fingerprint 비교만 하고 끝 — 재빌드(load) 호출 없음.
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
      // fire() 내부의 fingerprint 비교 + 조건부 load() 가 모두 microtask/promise
      // 체인이므로 flush.
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
