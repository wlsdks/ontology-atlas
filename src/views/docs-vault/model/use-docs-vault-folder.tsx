import { useCallback, useEffect, useMemo } from 'react';
import { useLocalVault } from '@/entities/vault-session';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import { AppSettingsMenu } from '@/widgets/app-settings-menu';
import { useNavRailSettingsSlot } from '@/widgets/app-nav-rail';
import { createTauriVaultHandle } from '@/shared/lib/vault-folder/native-vault/tauri-vault-handle';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import {
  DOGFOOD_VAULT_PATH,
  DOGFOOD_VAULT_PATH_CANDIDATES,
  hasDogfoodVaultPath,
  resolveDogfoodVaultPath,
} from '../lib/vault-source/dogfood-vault-path';
import {
  shouldShowDesktopVaultWelcome,
  shouldShowDogfoodVaultHint,
  shouldSwitchToDogfoodVault,
} from '../lib/persistence';
import { useDocsVaultPersistence } from '../lib/vault-source/use-docs-vault-persistence';
import { resolveVaultChipIdentity } from '../lib/vault-source/vault-chip-identity';
import type { useDocsVaultAddress } from './use-docs-vault-url';

/**
 * The folder this screen reads: its recents and pins, whether the folder chooser stands in for the
 * documents, and the dogfood hand-off. The screen has no other source of documents.
 */
export function useDocsVaultFolder({ address }: { address: ReturnType<typeof useDocsVaultAddress> }) {
  const { queryDogfood } = address;
  const localVault = useLocalVault();
  const navRailSettingsSlot = useMemo(
    () => <AppSettingsMenu mode="local" triggerVariant="rail-tile" />,
    [],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);

  const localVaultStatus = localVault.status;
  const localVaultRestoreAttempted = localVault.restoreAttempted;
  const openRecentLocalVault = localVault.openRecent;
  const localVaultRootPath = localVault.handle
    ? getTauriVaultRootPath(localVault.handle) ?? localVault.handle.name ?? null
    : null;
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
        localVaultStatus,
        currentRootPath: localVaultRootPath,
        dogfoodRootPath: DOGFOOD_VAULT_PATH,
        dogfoodRootPaths: DOGFOOD_VAULT_PATH_CANDIDATES,
      })
    ) {
      handleOpenDogfoodVault();
    }
  }, [handleOpenDogfoodVault, localVaultRootPath, localVaultStatus, queryDogfood]);

  const {
    recentKey,
    recentSlugs,
    setRecentSlugs,
    pinnedSlugs,
    setPinnedSlugs,
    pinnedSet,
    togglePin: handleTogglePin,
  } = useDocsVaultPersistence({ localVault });

  /**
   * One predicate for scope-switch cleanup, the missing-document banner and default selection:
   * any earlier decision mistakes the window before the remembered folder is read for reality.
   */
  const localSourceReady = localVaultStatus === 'loaded' || localVault.isReloadingSameVault;
  const showDesktopWelcome = shouldShowDesktopVaultWelcome({
    localVaultStatus,
    hasLocalManifest: Boolean(localVault.manifest),
  });
  const vaultScopeSettled =
    (localVaultRestoreAttempted || Boolean(localVault.manifest)) &&
    (localSourceReady || showDesktopWelcome);

  const showDogfoodHint =
    hasDogfoodVaultPath() &&
    shouldShowDogfoodVaultHint({
      dogfood: queryDogfood,
      hasLocalManifest: Boolean(localVault.manifest),
    });
  const isLocalSourceLoaded = localVault.status === 'loaded' && Boolean(localVault.manifest);

  const vaultChipIdentity = resolveVaultChipIdentity({
    isLocalSourceLoaded,
    localFolderName: localVault.handle?.name ?? null,
  });
  return {
    localVaultRootPath,
    recentKey,
    recentSlugs,
    setRecentSlugs,
    pinnedSlugs,
    setPinnedSlugs,
    pinnedSet,
    handleTogglePin,
    showDesktopWelcome,
    vaultScopeSettled,
    handleOpenDogfoodVault,
    showDogfoodHint,
    isLocalSourceLoaded,
    vaultChipIdentity,
  };
}
