import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  restoreAttempted: true,
  mode: 'no-folder' as 'no-folder' | 'local',
  /** Empty means someone who never opened a vault. */
  recentVaults: [] as unknown[],
}));

vi.mock('@/entities/vault-session/model/vault-provider/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/vault-provider/LocalVaultProvider')>()),
  useLocalVault: () => ({
    restoreAttempted: mocks.restoreAttempted,
    recentVaults: mocks.recentVaults,
  }),
}));
vi.mock('@/entities/vault-session/model/vault-source/use-data-source-mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/vault-source/use-data-source-mode')>()),
  useDataSourceMode: () => mocks.mode,
}));

import { useFirstRunRestoreKnown, useFirstRunNoFolderSettled } from './use-first-run-no-folder-settled';

describe('useFirstRunNoFolderSettled', () => {
  it('is true once restore has settled and no vault is active (no-folder mode)', () => {
    mocks.restoreAttempted = true;
    mocks.mode = 'no-folder';
    const { result } = renderHook(() => useFirstRunNoFolderSettled());
    expect(result.current).toBe(true);
  });

  it('is false while restore is still pending, even with no folder open (avoids the flash)', () => {
    mocks.restoreAttempted = false;
    mocks.mode = 'no-folder';
    const { result } = renderHook(() => useFirstRunNoFolderSettled());
    expect(result.current).toBe(false);
  });

  /** The first-run card is only for someone who has never connected, even while no vault is open. */
  it('does not show the first-run card with no folder open when a connection history exists', () => {
    mocks.restoreAttempted = true;
    mocks.mode = 'no-folder';
    mocks.recentVaults = [{ id: 'previously-opened' }];
    const { result } = renderHook(() => useFirstRunNoFolderSettled());
    expect(result.current).toBe(false);
  });

  it('is false once a vault is active (local mode)', () => {
    mocks.restoreAttempted = true;
    mocks.mode = 'local';
    const { result } = renderHook(() => useFirstRunNoFolderSettled());
    expect(result.current).toBe(false);
  });
});

describe('useFirstRunRestoreKnown', () => {
  it('is unknown while the restore is pending for someone with no folder history', () => {
    mocks.restoreAttempted = false;
    mocks.recentVaults = [];
    const { result } = renderHook(() => useFirstRunRestoreKnown());
    expect(result.current).toBe(false);
  });

  it('is known before the restore ends once a folder history exists', () => {
    mocks.restoreAttempted = false;
    mocks.recentVaults = [{ id: 'previously-opened' }];
    const { result } = renderHook(() => useFirstRunRestoreKnown());
    expect(result.current).toBe(true);
  });

  it('is known once the restore has been attempted', () => {
    mocks.restoreAttempted = true;
    mocks.recentVaults = [];
    const { result } = renderHook(() => useFirstRunRestoreKnown());
    expect(result.current).toBe(true);
  });
});
