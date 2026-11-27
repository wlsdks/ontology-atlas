'use client';

import { useEffect, useMemo } from 'react';
import { useLocalVault } from '../vault-provider/LocalVaultProvider';
import {
  getDataSourceMode,
  publishDataSourceModeForDebug,
  type DataSourceMode,
} from '@/shared/lib/vault-folder/data-source-mode';

/** `'local'` when a folder is open and the user's disk is the source of truth, `'no-folder'` before one is. Publishes the mode on `window.__ohMyOntologyMode` (debug only). */
export function useDataSourceMode(): DataSourceMode {
  const { status: vaultStatus, manifest } = useLocalVault();

  const mode = useMemo<DataSourceMode>(
    () =>
      getDataSourceMode({
        // An incremental rebuild keeps the last validated manifest: reporting no folder during that loading window would freeze local slug detail and edit pages as not-found.
        vaultLoaded: vaultStatus === 'loaded' || Boolean(manifest),
      }),
    [manifest, vaultStatus],
  );

  useEffect(() => {
    publishDataSourceModeForDebug(mode);
  }, [mode]);

  return mode;
}
