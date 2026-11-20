'use client';

import { useContext, useMemo } from 'react';
import { LocalVaultContext } from './local-vault-context';

/** The open folder and the files its walk was granted, as one consistent pair. */
export interface GrantedVaultFiles {
  root: FileSystemDirectoryHandle;
  fileHandles: ReadonlyMap<string, FileSystemFileHandle>;
}

/**
 * `null` while no folder is loaded, or while another folder is loading: the handle map then still
 * belongs to the previous folder. Reads the context itself, so a surface outside the provider gets null.
 */
export function useGrantedVaultFiles(): GrantedVaultFiles | null {
  const vault = useContext(LocalVaultContext);
  const root = vault && (vault.status === 'loaded' || vault.isReloadingSameVault) ? vault.handle : null;
  const fileHandles = vault?.fileHandles;
  return useMemo(() => (root && fileHandles ? { root, fileHandles } : null), [root, fileHandles]);
}
