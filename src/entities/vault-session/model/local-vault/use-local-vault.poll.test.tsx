import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

const tauri = vi.hoisted(() => ({
  isTauriVaultRuntime: vi.fn(() => true),
  tauriVaultPathExists: vi.fn(async () => true),
  listTauriDirectoryNames: vi.fn(async () => [] as string[]),
  createTauriVaultHandle: vi.fn(),
  getTauriVaultRootPath: vi.fn((h: { rootPath?: string }) => h?.rootPath),
  pickTauriVaultDirectory: vi.fn(),
  readTauriVaultTextTail: vi.fn(async () => ''),
}));

const store = vi.hoisted(() => ({
  getLocalFsHandle: vi.fn<() => Promise<LocalFsHandleRecord | undefined>>(async () => undefined),
  listRecentLocalFsHandles: vi.fn(async () => [] as LocalFsHandleRecord[]),
  putLocalFsHandle: vi.fn(async () => {}),
  touchLocalFsHandle: vi.fn(async () => {}),
  forgetRecentLocalFsHandle: vi.fn(async () => {}),
  deleteLocalFsHandle: vi.fn(async () => {}),
  verifyHandlePermission: vi.fn<() => Promise<PermissionState>>(async () => 'granted'),
}));

const docsVault = vi.hoisted(() => ({
  buildLocalManifestWithEntries: vi.fn(),
  rebuildLocalManifestIncremental: vi.fn(),
  computeLocalVaultFingerprintWithStamps: vi.fn(async () => ({ fingerprint: 'fp-vault', nativeStamps: null })),
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => tauri);
vi.mock('@/entities/local-fs-handle', () => ({ CURRENT_LOCAL_FS_HANDLE_ID: 'current', ...store }));
vi.mock('@/entities/docs-vault', () => docsVault);

import { useLocalVaultInternal } from './use-local-vault';

const sidecars = new Map<string, string>();

function folder(prefix: string): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: prefix || 'vault',
    getDirectoryHandle: async (name: string) => folder(prefix ? `${prefix}/${name}` : name),
    getFileHandle: async (name: string) => {
      const text = sidecars.get(prefix ? `${prefix}/${name}` : name);
      if (text === undefined) throw new DOMException('missing', 'NotFoundError');
      return { kind: 'file', name, getFile: async () => ({ text: async () => text, lastModified: 1 }) };
    },
  } as unknown as FileSystemDirectoryHandle;
}

function savedVault(rootPath?: string): LocalFsHandleRecord {
  return {
    id: 'current',
    handle: Object.assign(folder(''), { rootPath }),
    desktopRootPath: rootPath,
    name: 'vault',
    createdAt: 1,
    lastAccessedAt: 1,
  };
}

function builtVault() {
  return {
    build: {
      manifest: { version: '1', generatedAt: '', docs: [], backlinksDetail: {}, tags: {}, tree: { name: 'root', path: '', type: 'dir' as const } },
      fileHandles: new Map(),
      imageHandles: new Map(),
      fingerprint: 'fp-vault',
    },
    entries: [],
  };
}

async function openVault(surface: 'app' | 'web') {
  tauri.isTauriVaultRuntime.mockReturnValue(surface === 'app');
  if (surface === 'web') Object.defineProperty(window, 'showDirectoryPicker', { value: vi.fn(), configurable: true });
  store.getLocalFsHandle.mockResolvedValue(savedVault(surface === 'app' ? '/Users/dana/vault' : undefined));
  const hook = renderHook(() => useLocalVaultInternal());
  await vi.waitFor(() => expect(hook.result.current.status).toBe('loaded'));
  docsVault.computeLocalVaultFingerprintWithStamps.mockClear();
  return hook;
}

const idleMinutes = async (minutes: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(minutes * 60_000);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  docsVault.buildLocalManifestWithEntries.mockResolvedValue(builtVault());
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  sidecars.clear();
  Reflect.deleteProperty(window, 'showDirectoryPicker');
});

describe('keeping an open vault current', () => {
  it('checks an idle app folder once a minute, since its watcher reports changes at once', async () => {
    await openVault('app');
    await idleMinutes(10);
    expect(docsVault.computeLocalVaultFingerprintWithStamps).toHaveBeenCalledTimes(10);
  });

  it('checks an idle web folder every five seconds, since the web has no folder events', async () => {
    await openVault('web');
    await idleMinutes(10);
    expect(docsVault.computeLocalVaultFingerprintWithStamps).toHaveBeenCalledTimes(120);
  });

  it('marks a quiet agent heartbeat stale when it passes five minutes, between two checks', async () => {
    const writtenBeforeOpenMs = 30_000;
    sidecars.set(
      '.ontology-atlas/agent-activity.json',
      JSON.stringify({ agent: 'claude', state: 'editing', updatedAt: new Date(Date.now() - writtenBeforeOpenMs).toISOString() }),
    );
    const hook = await openVault('app');
    expect(hook.result.current.agentActivityStatus.stale).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 - writtenBeforeOpenMs + 1_000);
    });

    expect(hook.result.current.agentActivityStatus.stale).toBe(true);
  });

  it('reads only the tail of the activity log in the app', async () => {
    tauri.readTauriVaultTextTail.mockResolvedValue(
      [1, 2].map((n) => JSON.stringify({ v: 1, at: `2026-09-27T00:0${n}:00Z`, summary: `entry ${n}` })).join('\n'),
    );
    const hook = await openVault('app');
    expect(hook.result.current.agentActivityLog).toHaveLength(2);
    expect(tauri.readTauriVaultTextTail).toHaveBeenCalledWith('/Users/dana/vault', '.ontology-atlas/activity.jsonl', 50);
  });

  it('checks the folder when the app window regains focus', async () => {
    await openVault('app');

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await vi.waitFor(() => expect(docsVault.computeLocalVaultFingerprintWithStamps).toHaveBeenCalledTimes(1));
    expect(docsVault.buildLocalManifestWithEntries).toHaveBeenCalledTimes(1);
  });
});
