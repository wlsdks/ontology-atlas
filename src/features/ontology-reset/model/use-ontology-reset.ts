'use client';

import { useMemo } from 'react';

import { verifyHandlePermission } from '@/entities/local-fs-handle';
import { useLocalVault } from '@/entities/vault-session';
import { conceptDocumentPaths } from './concept-documents';
import {
  moveConceptDocuments,
  resetStamp,
  restoreConceptDocuments,
  type MoveOutcome,
  type RestoreOutcome,
} from './move-concept-documents';

export interface ClearedConcepts {
  stamp: string;
  moved: readonly string[];
}

async function writableRoot(handle: FileSystemDirectoryHandle | null): Promise<FileSystemDirectoryHandle> {
  if (!handle) throw new Error('Vault is not open');
  if ((await verifyHandlePermission(handle, 'readwrite', { ask: true })) !== 'granted') {
    throw new Error('Write permission denied');
  }
  return handle;
}

/**
 * Clears the open folder's concept documents into `.ontology-atlas/removed/<stamp>/` and puts
 * them back. The session reloads once per action, after the last file, not per file.
 */
export function useOntologyReset() {
  const localVault = useLocalVault();
  const loaded = localVault.status === 'loaded' && localVault.manifest !== null;
  const handle = loaded ? localVault.handle : null;
  const manifest = loaded ? localVault.manifest : null;
  const paths = useMemo(() => (manifest ? conceptDocumentPaths(manifest.docs) : []), [manifest]);
  const { refresh, markSelfWrite } = localVault;

  const clear = async (): Promise<ClearedConcepts> => {
    const root = await writableRoot(handle);
    const outcome: MoveOutcome = await moveConceptDocuments(root, paths, resetStamp(new Date()));
    if (outcome.moved.length > 0) await refresh();
    if (outcome.failure) throw outcome.failure;
    return { stamp: outcome.stamp, moved: outcome.moved };
  };

  const undo = async (cleared: ClearedConcepts): Promise<RestoreOutcome> => {
    const root = await writableRoot(handle);
    const outcome = await restoreConceptDocuments(root, cleared.moved, cleared.stamp);
    for (const path of outcome.restored) markSelfWrite(path.replace(/\.md$/, ''));
    if (outcome.restored.length > 0) await refresh();
    if (outcome.failure) throw outcome.failure;
    return outcome;
  };

  return { conceptCount: paths.length, ready: loaded, clear, undo };
}
