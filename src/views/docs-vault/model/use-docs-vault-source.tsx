'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { useLocalVault } from '@/entities/vault-session';
import { AppSettingsMenu } from '@/widgets/app-settings-menu';
import { useNavRailSettingsSlot } from '@/widgets/app-nav-rail';
import { isTauriVaultRuntime } from '@/shared/lib/tauri-vault-fs';
import { shouldHonorLocalIntent, type DocsVaultSource as Source } from '../lib/persistence';

const subscribeDesktopRuntime = () => () => undefined;
const readDesktopRuntime = () => isTauriVaultRuntime();
const readServerDesktopRuntime = () => false;

export function useDocsVaultSource({
  localVault,
  querySource,
  querySample,
  installedShell,
  setAdvancedOpen,
}: {
  localVault: ReturnType<typeof useLocalVault>;
  querySource: Source | null;
  querySample: 'dogfood' | null;
  installedShell: boolean;
  setAdvancedOpen: (open: boolean) => void;
}) {
  const localWinsInitialSource =
    Boolean(localVault.manifest) && (installedShell || querySource !== 'server');
  const localIntentAutoOpenRef = useRef(false);
  // A loaded local vault starts local; `?intent=local` switches after mount, in the effect below.
  const [source, setSource] = useState<Source>(() =>
    localWinsInitialSource ? 'local' : querySource ?? 'server',
  );
  const [staticSampleOverride, setStaticSampleOverride] = useState<
    'dogfood' | null
  >(querySample);
  // Do not select the default README until the stored source is read, or a local
  // deeplink is overwritten by the server manifest.
  const [sourcePreferenceHydrated, setSourcePreferenceHydrated] =
    useState(() => localWinsInitialSource);
  // The rail gear owns settings at lg+; below lg the header chrome tile does.
  const navRailSettingsSlot = useMemo(
    () => (
      <AppSettingsMenu
        mode={source === 'local' ? 'local' : 'static'}
        triggerVariant="rail-tile"
      />
    ),
    [source],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);
  const isDesktopRuntime = useSyncExternalStore(
    subscribeDesktopRuntime,
    readDesktopRuntime,
    readServerDesktopRuntime,
  );
  // `searchParams` can be stale at SSR time, so read `window.location` after mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (querySource) return;
    const intent = new URLSearchParams(window.location.search).get('intent');
    if (shouldHonorLocalIntent(intent, isDesktopRuntime)) {
      window.queueMicrotask(() => {
        localIntentAutoOpenRef.current = true;
        setSource('local');
        setSourcePreferenceHydrated(true);
        setAdvancedOpen(false);
      });
    }
    // Mount only, so a closed panel does not reopen on reload.
  }, [isDesktopRuntime, querySource, setAdvancedOpen]);
  return {
    source,
    setSource,
    staticSampleOverride,
    setStaticSampleOverride,
    sourcePreferenceHydrated,
    setSourcePreferenceHydrated,
    isDesktopRuntime,
    localWinsInitialSource,
    localIntentAutoOpenRef,
  };
}
