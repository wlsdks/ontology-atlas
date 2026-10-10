'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useLocalVault } from '@/entities/vault-session';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import { AppSettingsMenu } from '@/widgets/app-settings-menu';
import { useNavRailSettingsSlot } from '@/widgets/app-nav-rail';
import { migrateLegacyRecentDocs, pushRecentDoc } from '@/widgets/docs-vault';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { useHydrated } from '@/shared/lib/use-hydrated';
import {
  createTauriVaultHandle,
  getTauriVaultRootPath,
  isTauriVaultRuntime,
} from '@/shared/lib/tauri-vault-fs';
import {
  DOGFOOD_VAULT_PATH,
  DOGFOOD_VAULT_PATH_CANDIDATES,
  hasDogfoodVaultPath,
  resolveDogfoodVaultPath,
} from '../lib/dogfood-vault-path';
import {
  isDocsVaultLocalSourceDisabled,
  readStoredSource,
  scheduleStateSync,
  shouldHonorLocalIntent,
  shouldPreferLocalOnLanding,
  shouldShowDesktopVaultWelcome,
  shouldShowDogfoodVaultHint,
  shouldSwitchToDogfoodVault,
  storeSource,
  type DocsVaultSource as Source,
} from '../lib/persistence';
import { useDocsVaultPersistence } from '../lib/use-docs-vault-persistence';
import { resolveVaultChipIdentity } from '../lib/vault-chip-identity';
import type { useDocsVaultAddress } from './use-docs-vault-url';

const subscribeDesktopRuntime = () => () => undefined;
const readDesktopRuntime = () => isTauriVaultRuntime();
const readServerDesktopRuntime = () => false;

export function useDocsVaultSource({
  address,
  setAdvancedOpen,
  setSelectedSlug,
  setActiveTag,
  setSampleWelcomeDismissed,
}: {
  address: ReturnType<typeof useDocsVaultAddress>;
  setAdvancedOpen: (open: boolean) => void;
  setSelectedSlug: (slug: string | null) => void;
  setActiveTag: (tag: string | null) => void;
  setSampleWelcomeDismissed: (dismissed: boolean) => void;
}) {
  const { querySource, querySample, queryDogfood, view, replaceUrlState } = address;
  const router = useRouter();
  const localVault = useLocalVault();
  const hydrated = useHydrated();
  const installedShell = hydrated && isDesktopShell();
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

  const localVaultStatus = localVault.status;
  // Distinguishes "not known yet" from "confirmed absent"; the landing decision waits on it.
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
  const localSourceDisabled = isDocsVaultLocalSourceDisabled({
    isDesktopRuntime,
    localVaultStatus: localVault.status,
  });
  const {
    recentKey,
    recentSlugs,
    setRecentSlugs,
    pinnedSlugs,
    setPinnedSlugs,
    pinnedSet,
    togglePin: handleTogglePin,
  } = useDocsVaultPersistence({ source, localVault });

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
  }, [installedShell, isDesktopRuntime, localVault.manifest, querySource]);

  // Once per mount, when the restore attempt finishes, prefer a live local vault over a
  // stored sample preference; not persisted.
  const [landingSourceResolved, setLandingSourceResolved] = useState(
    () => localWinsInitialSource,
  );
  useEffect(() => {
    if (landingSourceResolved) return;
    if (!sourcePreferenceHydrated || !localVaultRestoreAttempted) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a once-per-mount latch that render reads
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

  // Fall back to the sample only when FSA is unsupported; a local web session is valid.
  useEffect(() => {
    if (source === 'local' && localVaultStatus === 'unsupported') {
      scheduleStateSync(() => {
        setSource('server');
        storeSource('server');
      });
    }
  }, [source, localVaultStatus]);

  useEffect(() => {
    if (
      source === 'local' &&
      localVaultStatus === 'loaded' &&
      localIntentAutoOpenRef.current
    ) {
      localIntentAutoOpenRef.current = false;
      setAdvancedOpen(false);
    }
  }, [source, localVaultStatus, setAdvancedOpen]);

  const handleSourceChange = useCallback((next: Source) => {
    // The installed app has no bundled sample; legacy commands and links must not reopen it.
    if (installedShell && next === 'server') return;
    setSource(next);
    setStaticSampleOverride(null);
    storeSource(next);
    // The same slug rarely exists in both vaults.
    setSelectedSlug(null);
    setActiveTag(null);
    // Re-show the welcome note on every entry into sample mode.
    if (next === 'server') setSampleWelcomeDismissed(false);
    replaceUrlState(
      next === 'server'
        ? { slug: null, view, intent: null, source: null, sample: null }
        : { slug: null, view, source: null, sample: null },
    );
    // The native picker opens only from the welcome screen's "open folder".
    if (next === 'local' && isDesktopRuntime && localVault.status !== 'loaded') {
      localIntentAutoOpenRef.current = true;
      setAdvancedOpen(false);
    }
  }, [installedShell, isDesktopRuntime, replaceUrlState, view, localVault.status, setAdvancedOpen, setActiveTag, setSampleWelcomeDismissed, setSelectedSlug]);

  const handleOpenAgentGraphWorkflowGuide = useCallback(() => {
    const slug = 'AGENT-GRAPH-WORKFLOW';
    setSource('server');
    setStaticSampleOverride('dogfood');
    setRecentSlugs(pushRecentDoc('server', slug));
    setAdvancedOpen(false);
    router.push(`/docs/?source=server&sample=dogfood&slug=${slug}&view=doc`);
  }, [router, setAdvancedOpen, setRecentSlugs]);

  const showDogfoodHint = hasDogfoodVaultPath() && shouldShowDogfoodVaultHint({
    dogfood: queryDogfood,
    isDesktopRuntime,
    source,
    hasLocalManifest: Boolean(localVault.manifest),
  });
  const isLocalSourceLoaded =
    source === 'local' &&
    localVault.status === 'loaded' &&
    Boolean(localVault.manifest);

  const vaultChipIdentity = resolveVaultChipIdentity({
    source,
    isLocalSourceLoaded,
    localFolderName: localVault.handle?.name ?? null,
  });
  return {
    source,
    staticSampleOverride,
    installedShell,
    isDesktopRuntime,
    localSourceDisabled,
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
    handleSourceChange,
    handleOpenAgentGraphWorkflowGuide,
    showDogfoodHint,
    isLocalSourceLoaded,
    vaultChipIdentity,
  };
}
