'use client';

import { useContext, useEffect, useSyncExternalStore } from 'react';
import {
  emptyStaticVaultSource,
  loadStaticVaultSource,
  peekStaticVaultSource,
  subscribeStaticVaultSource,
  type StaticVaultSource,
} from '@/entities/docs-vault';
import { isDesktopShell } from '@/shared/lib/desktop-shell/desktop-shell';
import { getDataSourceMode } from '@/shared/lib/vault-folder/data-source-mode';
import type { SampleSource } from '@/shared/lib/vault-folder/sample-source';
import { LocalVaultContext } from './local-vault-context';
import { useSampleSource } from './use-sample-source';

/**
 * `loading`: a web visitor's sample is on its way. `ready`: the sample is in hand. `none`: nothing
 * will load, because the installed app never renders a bundled sample (docs/DECISIONS.md,
 * 2026-08-30) or a vault has been chosen and the sample is not wanted.
 */
export type StaticVaultStatus = 'loading' | 'ready' | 'none';

interface StaticVaultState {
  source: StaticVaultSource;
  status: StaticVaultStatus;
}

const getServerSnapshot = () => null;

/**
 * Reads the bundled sample the screen shows and starts its download once, after hydration, when
 * no local vault owns the screen. Before it arrives `source` is the empty sample of the same name.
 */
function useStaticVaultState(override: SampleSource | undefined): StaticVaultState {
  const [preferred] = useSampleSource();
  const sample = override ?? preferred;
  // The context itself, not `useLocalVault()`, so a screen mounted outside the provider still reads.
  const vault = useContext(LocalVaultContext);
  const local =
    getDataSourceMode({ vaultLoaded: vault?.status === 'loaded' || Boolean(vault?.manifest) }) ===
    'local';
  const wanted = override !== undefined || !local;

  const loaded = useSyncExternalStore(
    subscribeStaticVaultSource,
    () => peekStaticVaultSource(sample),
    getServerSnapshot,
  );

  useEffect(() => {
    if (!wanted || loaded || isDesktopShell()) return;
    void loadStaticVaultSource(sample);
  }, [wanted, loaded, sample]);

  if (loaded) return { source: loaded, status: 'ready' };
  const source = emptyStaticVaultSource(sample);
  // The desktop check is read after hydration only (SSR and the first client render see the
  // browser), so a reader that needs the exact answer waits for `useHydrated()` first.
  return { source, status: wanted && !isDesktopShell() ? 'loading' : 'none' };
}

/**
 * Screen code must use this hook, not the bundled JSON, or it ignores the sample choice. In local
 * mode callers discard the value. `override` pins one sample regardless of the choice (the docs
 * screen's dogfood link). The value is empty until `useStaticVaultStatus()` says `ready`, and
 * stays empty in the installed app. See `entities/docs-vault/lib/bundled-vault/load-static-vault-source.ts`.
 */
export function useStaticVaultSource(override?: SampleSource): StaticVaultSource {
  return useStaticVaultState(override).source;
}

export function useStaticVaultStatus(override?: SampleSource): StaticVaultStatus {
  return useStaticVaultState(override).status;
}
