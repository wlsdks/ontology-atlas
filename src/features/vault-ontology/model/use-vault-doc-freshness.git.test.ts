import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VaultManifest } from '@/entities/docs-vault';

const git = vi.hoisted(() => ({
  gitDiff: vi.fn(async () => ({ count: 0, files: [], diff: '' })),
  gitPathsLastChange: vi.fn(async () => []),
  isGitBridgeAvailable: vi.fn(() => true),
}));

const manifest: VaultManifest = {
  version: '1',
  generatedAt: '2026-09-27T00:00:00.000Z',
  docs: [],
  backlinksDetail: {},
  tags: {},
  tree: { name: 'root', path: '', type: 'dir' },
};
const handle = { kind: 'directory', name: 'vault', rootPath: '/vault' } as unknown as FileSystemDirectoryHandle;

vi.mock('@/shared/lib/tauri-git', () => git);
vi.mock('@/shared/lib/tauri-vault-fs', () => ({ getTauriVaultRootPath: () => '/vault' }));
vi.mock('@/shared/lib/select-open-vault-handle', () => ({ selectOpenVaultHandle: () => handle }));
vi.mock('@/entities/vault-session', () => ({
  useDataSourceMode: () => 'local',
  useLocalVault: () => ({ status: 'loaded', manifest, handle }),
  useStaticVaultSource: () => ({ manifest }),
}));

import { useVaultDocDates } from './use-vault-doc-freshness';

describe('dating vault documents from Git', () => {
  it('asks Git for the changed file list without the patch text it never reads', async () => {
    renderHook(() => useVaultDocDates());

    await waitFor(() => expect(git.gitDiff).toHaveBeenCalledTimes(1));
    expect(git.gitDiff).toHaveBeenCalledWith('/vault', { includePatch: false });
  });
});
