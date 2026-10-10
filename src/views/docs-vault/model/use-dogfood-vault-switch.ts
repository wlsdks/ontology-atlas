'use client';

import { useCallback, useEffect } from 'react';
import type { useLocalVault } from '@/entities/vault-session';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import { createTauriVaultHandle } from '@/shared/lib/tauri-vault-fs';
import {
  DOGFOOD_VAULT_PATH,
  DOGFOOD_VAULT_PATH_CANDIDATES,
  hasDogfoodVaultPath,
  resolveDogfoodVaultPath,
} from '../lib/dogfood-vault-path';
import { shouldSwitchToDogfoodVault } from '../lib/persistence';

type LocalVault = ReturnType<typeof useLocalVault>;

export function useDogfoodVaultSwitch({
  queryDogfood,
  isDesktopRuntime,
  source,
  localVaultStatus,
  localVaultRootPath,
  openRecentLocalVault,
}: {
  queryDogfood: string | null;
  isDesktopRuntime: boolean;
  source: 'server' | 'local';
  localVaultStatus: LocalVault['status'];
  localVaultRootPath: string | null;
  openRecentLocalVault: LocalVault['openRecent'];
}) {
  const handleOpenDogfoodVault = useCallback(() => {
    const now = Date.now();
    void resolveDogfoodVaultPath().then((rootPath) => {
      const handle = createTauriVaultHandle(rootPath);
      const record: LocalFsHandleRecord = {
        id: rootPath,
        handle,
        desktopRootPath: rootPath,
        name: handle.name,
        createdAt: now,
        lastAccessedAt: now,
      };
      return openRecentLocalVault(record);
    });
  }, [openRecentLocalVault]);

  useEffect(() => {
    // A build with no configured path does nothing rather than open a path that does not exist.
    if (
      hasDogfoodVaultPath() &&
      shouldSwitchToDogfoodVault({
        dogfood: queryDogfood,
        isDesktopRuntime,
        source,
        localVaultStatus,
        currentRootPath: localVaultRootPath,
        dogfoodRootPath: DOGFOOD_VAULT_PATH,
        dogfoodRootPaths: DOGFOOD_VAULT_PATH_CANDIDATES,
      })
    ) {
      handleOpenDogfoodVault();
    }
  }, [
    handleOpenDogfoodVault,
    isDesktopRuntime,
    localVaultRootPath,
    localVaultStatus,
    queryDogfood,
    source,
  ]);
  return handleOpenDogfoodVault;
}
