'use client';

import type { VaultManifest } from '@/entities/docs-vault';
import { useLocalVault } from './LocalVaultProvider';

/** What a screen reads while no folder is open: no documents, never a stand-in. One object, so a memo keyed on it holds. */
const NO_FOLDER_MANIFEST: VaultManifest = {
  version: '',
  generatedAt: '',
  docs: [],
  backlinkSources: {},
  tags: {},
  tree: { name: 'root', path: '', type: 'dir' },
};

/**
 * The open folder's manifest, or the shared empty one. Granted the way `useGrantedVaultFiles` is:
 * while another folder is loading, the manifest still belongs to the previous folder and counts
 * as none; while the same folder reloads, or the picker is open over a loaded folder, it stays.
 */
export function useOpenFolderManifest(): VaultManifest {
  const vault = useLocalVault();
  const granted =
    vault.status === 'loaded' ||
    vault.isReloadingSameVault ||
    (vault.status === 'opening' && vault.manifest !== null);
  return granted && vault.manifest ? vault.manifest : NO_FOLDER_MANIFEST;
}
