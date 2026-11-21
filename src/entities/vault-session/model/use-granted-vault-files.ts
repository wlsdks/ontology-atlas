'use client';

import { useContext, useMemo } from 'react';
import { LocalVaultContext } from './local-vault-context';

export interface GrantedVaultFiles {
  root: FileSystemDirectoryHandle;
  fileHandles: ReadonlyMap<string, FileSystemFileHandle>;
}

/**
 * `null` while no folder is loaded, or while another folder is loading: the handle map then still
 * belongs to the previous folder. While the picker is open (`opening`) the loaded folder and its map
 * are unchanged, so they stay granted. Reads the context itself, so a surface outside the provider gets null.
 */
export function useGrantedVaultFiles(): GrantedVaultFiles | null {
  const vault = useContext(LocalVaultContext);
  const granted =
    vault !== null &&
    (vault.status === 'loaded' || vault.isReloadingSameVault || (vault.status === 'opening' && vault.manifest !== null));
  const root = granted ? vault.handle : null;
  const fileHandles = vault?.fileHandles;
  return useMemo(() => (root && fileHandles ? { root, fileHandles } : null), [root, fileHandles]);
}
