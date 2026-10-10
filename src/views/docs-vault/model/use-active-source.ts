'use client';

import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useRouter } from '@/i18n/navigation';
import type { useLocalVault } from '@/entities/vault-session';
import { pushRecentDoc } from '@/widgets/docs-vault';
import { hasDogfoodVaultPath } from '../lib/dogfood-vault-path';
import { resolveVaultChipIdentity } from '../lib/vault-chip-identity';
import {
  scheduleStateSync,
  shouldShowDogfoodVaultHint,
  storeSource,
  type DocsVaultSource as Source,
  type DocsVaultView,
} from '../lib/persistence';

type LocalVault = ReturnType<typeof useLocalVault>;

export function useActiveSource({
  source,
  setSource,
  setStaticSampleOverride,
  localVault,
  localVaultStatus,
  installedShell,
  isDesktopRuntime,
  queryDogfood,
  view,
  replaceUrlState,
  setSelectedSlug,
  setActiveTag,
  setSampleWelcomeDismissed,
  setAdvancedOpen,
  setRecentSlugs,
  localIntentAutoOpenRef,
}: {
  source: Source;
  setSource: Dispatch<SetStateAction<Source>>;
  setStaticSampleOverride: Dispatch<SetStateAction<'dogfood' | null>>;
  localVault: LocalVault;
  localVaultStatus: LocalVault['status'];
  installedShell: boolean;
  isDesktopRuntime: boolean;
  queryDogfood: string | null;
  view: DocsVaultView;
  replaceUrlState: (state: Record<string, string | null>) => void;
  setSelectedSlug: Dispatch<SetStateAction<string | null>>;
  setActiveTag: Dispatch<SetStateAction<string | null>>;
  setSampleWelcomeDismissed: Dispatch<SetStateAction<boolean>>;
  setAdvancedOpen: (open: boolean) => void;
  setRecentSlugs: Dispatch<SetStateAction<string[]>>;
  localIntentAutoOpenRef: MutableRefObject<boolean>;
}) {
  const router = useRouter();
  // Fall back to the sample only when FSA is unsupported; a local web session is valid.
  useEffect(() => {
    if (source === 'local' && localVaultStatus === 'unsupported') {
      scheduleStateSync(() => {
        setSource('server');
        storeSource('server');
      });
    }
  }, [source, localVaultStatus, setSource]);

  useEffect(() => {
    if (
      source === 'local' &&
      localVaultStatus === 'loaded' &&
      localIntentAutoOpenRef.current
    ) {
      localIntentAutoOpenRef.current = false;
      setAdvancedOpen(false);
    }
  }, [source, localVaultStatus, setAdvancedOpen, localIntentAutoOpenRef]);

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
  }, [installedShell, isDesktopRuntime, replaceUrlState, view, localVault.status, setAdvancedOpen, localIntentAutoOpenRef, setActiveTag, setSampleWelcomeDismissed, setSelectedSlug, setSource, setStaticSampleOverride]);

  const handleOpenAgentGraphWorkflowGuide = useCallback(() => {
    const slug = 'AGENT-GRAPH-WORKFLOW';
    setSource('server');
    setStaticSampleOverride('dogfood');
    setRecentSlugs(pushRecentDoc('server', slug));
    setAdvancedOpen(false);
    router.push(`/docs/?source=server&sample=dogfood&slug=${slug}&view=doc`);
  }, [router, setAdvancedOpen, setRecentSlugs, setSource, setStaticSampleOverride]);

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
    handleSourceChange,
    handleOpenAgentGraphWorkflowGuide,
    showDogfoodHint,
    isLocalSourceLoaded,
    vaultChipIdentity,
  };
}
