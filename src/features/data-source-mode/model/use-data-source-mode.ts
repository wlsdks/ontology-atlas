'use client';

import { useEffect, useMemo } from 'react';
import { useLocalVault } from '@/features/docs-vault-local';
import {
  getDataSourceMode,
  publishDataSourceModeForDebug,
  type DataSourceMode,
} from '@/shared/lib/data-source-mode';

/**
 * Exposes the current operating mode (`'static' | 'local'`) as React state.
 *
 * - **local**: a vault is chosen and the user's disk is the source of truth
 * - **static**: no vault chosen; the build-time dogfood manifest
 *
 * Side effect: publishes the current mode on `window.__ohMyOntologyMode` (debug only).
 */
export function useDataSourceMode(): DataSourceMode {
  const { status: vaultStatus, manifest } = useLocalVault();

  const mode = useMemo<DataSourceMode>(
    () =>
      getDataSourceMode({
        // An incremental rebuild after a write or a poll preserves the last validated
        // manifest. Switching the source to static dogfood during that brief loading window
        // freezes local slug detail and edit pages as not-found. Only the first load (no
        // manifest) is static.
        vaultLoaded: vaultStatus === 'loaded' || Boolean(manifest),
      }),
    [manifest, vaultStatus],
  );

  useEffect(() => {
    publishDataSourceModeForDebug(mode);
  }, [mode]);

  return mode;
}
