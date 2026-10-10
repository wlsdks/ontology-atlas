'use client';

import { useEffect, useState } from 'react';
import type { useLocalVault } from '@/entities/vault-session';
import {
  readStoredSource,
  scheduleStateSync,
  shouldHonorLocalIntent,
  shouldPreferLocalOnLanding,
  shouldShowDesktopVaultWelcome,
  type DocsVaultSource as Source,
} from '../lib/persistence';
import { migrateLegacyRecentDocs } from '@/widgets/docs-vault';

type LocalVault = ReturnType<typeof useLocalVault>;

export function useLandingSource({
  installedShell,
  isDesktopRuntime,
  localVault,
  localVaultStatus,
  localVaultRestoreAttempted,
  querySource,
  source,
  setSource,
  sourcePreferenceHydrated,
  setSourcePreferenceHydrated,
  localWinsInitialSource,
}: {
  installedShell: boolean;
  isDesktopRuntime: boolean;
  localVault: LocalVault;
  localVaultStatus: LocalVault['status'];
  localVaultRestoreAttempted: boolean;
  querySource: Source | null;
  source: Source;
  setSource: (source: Source) => void;
  sourcePreferenceHydrated: boolean;
  setSourcePreferenceHydrated: (hydrated: boolean) => void;
  localWinsInitialSource: boolean;
}) {
  useEffect(() => {
    migrateLegacyRecentDocs();
    // A mounted local vault wins on landing; `?source=server` stays a web-only choice.
    if (localVault.manifest && (installedShell || querySource !== 'server')) {
      scheduleStateSync(() => {
        setSource('local');
        setSourcePreferenceHydrated(true);
      });
      return;
    }
    // The installed shell never revives the stored web/sample preference.
    if (installedShell) return;
    if (querySource) {
      scheduleStateSync(() => {
        setSource(querySource);
        setSourcePreferenceHydrated(true);
      });
      return;
    }
    // `?intent=local` holds in every runtime; the mount effect above switches the source.
    if (typeof window !== 'undefined') {
      const intent = new URLSearchParams(window.location.search).get('intent');
      if (shouldHonorLocalIntent(intent, isDesktopRuntime)) {
        scheduleStateSync(() => setSourcePreferenceHydrated(true));
        return;
      }
    }
    scheduleStateSync(() => {
      setSource(readStoredSource());
      setSourcePreferenceHydrated(true);
    });
  }, [installedShell, isDesktopRuntime, localVault.manifest, querySource, setSource, setSourcePreferenceHydrated]);

  // Once per mount, when the restore attempt finishes, prefer a live local vault over a
  // stored sample preference; not persisted.
  const [landingSourceResolved, setLandingSourceResolved] = useState(
    () => localWinsInitialSource,
  );
  useEffect(() => {
    if (landingSourceResolved) return;
    if (!sourcePreferenceHydrated || !localVaultRestoreAttempted) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLandingSourceResolved(true);
    if (
      shouldPreferLocalOnLanding(
        localVaultStatus,
        source,
        querySource,
        localVault.awaitingVaultChoice,
      )
    ) {
      setSource('local');
    }
  }, [
    landingSourceResolved,
    sourcePreferenceHydrated,
    localVaultRestoreAttempted,
    localVaultStatus,
    localVault.awaitingVaultChoice,
    querySource,
    source,
    setSource,
  ]);
  /**
   * One predicate for scope-switch cleanup, the missing-document banner and default
   * selection: any earlier decision mistakes the boot-time sample window for reality.
   */
  const localSourceReady =
    localVaultStatus === 'loaded' || localVault.isReloadingSameVault;
  const showDesktopWelcome = shouldShowDesktopVaultWelcome({
    isDesktopRuntime,
    source,
    localVaultStatus,
    hasLocalManifest: Boolean(localVault.manifest),
  });
  const vaultScopeSettled =
    sourcePreferenceHydrated &&
    landingSourceResolved &&
    // A local source with no manifest is settled too: the folder picker owns the screen.
    (source === 'server' || localSourceReady || showDesktopWelcome);
  return { showDesktopWelcome, vaultScopeSettled };
}
