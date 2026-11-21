'use client';

import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { bundledSamples, type StaticVaultSource } from '@/entities/docs-vault';
import { isDesktopShell } from '@/shared/lib/desktop-shell/desktop-shell';
import { getDataSourceMode } from '@/shared/lib/vault-folder/data-source-mode';
import { getSampleSourceSnapshot, type SampleSource } from '@/shared/lib/vault-folder/sample-source';
import { LocalVaultContext } from '../vault-provider/local-vault-context';
import { useSampleSource } from './use-sample-source';

/** `loading`: a web visitor's sample is on its way. `ready`: in hand. `failed`: not downloaded even after a retry. `none`: nothing will load (the installed app never renders a bundled sample, or a vault has been chosen). */
export type StaticVaultStatus = 'loading' | 'ready' | 'failed' | 'none';

interface StaticVaultState {
  source: StaticVaultSource;
  status: StaticVaultStatus;
  sample: SampleSource;
  wait: () => Promise<unknown>;
  retry: () => void;
}

const getServerSnapshot = () => null;
const getServerState = () => 'idle' as const;
const settled = () => Promise.resolve();

/**
 * With `demand` (the default) the first reader starts the download; a reader that only wants what is there passes false, so a
 * surface that never draws the sample never fetches it. While the next sample downloads the previous one stays in `source`.
 */
function useStaticVaultState(
  override: SampleSource | undefined,
  demand: boolean,
): StaticVaultState {
  const [preferred] = useSampleSource();
  const sample = override ?? preferred;
  // The context itself, not `useLocalVault()`, so a screen mounted outside the provider still reads.
  const vault = useContext(LocalVaultContext);
  const local =
    getDataSourceMode({ vaultLoaded: vault?.status === 'loaded' || Boolean(vault?.manifest) }) ===
    'local';
  const wanted = override !== undefined || !local;

  // The sample to download is the stored choice itself: while hydrating, `sample` is the server's
  // default, and downloading that would show a sample nobody chose.
  const target = override ?? getSampleSourceSnapshot();

  const exactLoaded = useSyncExternalStore(
    bundledSamples.subscribe,
    () => bundledSamples.peek(sample),
    getServerSnapshot,
  );
  // What this reader last drew stays on show while the next sample downloads, so choosing the
  // other sample swaps data in place. Only a sample this reader drew qualifies.
  const [kept, setKept] = useState<StaticVaultSource | null>(null);
  if (exactLoaded && kept !== exactLoaded) setKept(exactLoaded);
  const loaded = exactLoaded ?? (override === undefined ? kept : null);
  const phase = useSyncExternalStore(
    bundledSamples.subscribe,
    () => bundledSamples.state(sample),
    getServerState,
  );
  const exact = phase === 'ready';

  useEffect(() => {
    if (!demand || !wanted || exact || phase === 'failed' || isDesktopShell()) return;
    void bundledSamples.load(target);
  }, [demand, wanted, exact, phase, target]);

  const retry = useCallback(() => {
    void bundledSamples.retry(sample);
  }, [sample]);

  // The desktop check is read after hydration only (SSR and the first client render see the
  // browser), so a reader that needs the exact answer waits for `useHydrated()` first.
  const absent = !wanted || isDesktopShell();
  if (loaded) return { source: loaded, status: 'ready', sample, wait: settled, retry };
  const source = bundledSamples.empty(sample);
  if (absent) return { source, status: 'none', sample, wait: settled, retry };
  if (phase === 'failed') return { source, status: 'failed', sample, wait: settled, retry };
  return { source, status: 'loading', sample, wait: () => bundledSamples.load(target), retry };
}

/** Screen code must use this hook, not the bundled JSON, or it ignores the sample choice. `override` pins one sample; the value is empty until the status is `ready`, and stays empty in the installed app. */
export function useStaticVaultSource(
  override?: SampleSource,
  options?: { demand?: boolean },
): StaticVaultSource {
  return useStaticVaultState(override, options?.demand ?? true).source;
}

export function useStaticVaultStatus(
  override?: SampleSource,
  options?: { demand?: boolean },
): StaticVaultStatus {
  return useStaticVaultState(override, options?.demand ?? true).status;
}

export function useStaticVaultGate(override?: SampleSource): {
  status: StaticVaultStatus;
  wait: () => Promise<unknown>;
  retry: () => void;
} {
  const { status, wait, retry } = useStaticVaultState(override, true);
  return { status, wait, retry };
}

/** Starts the preferred sample's download without a screen, so it overlaps the page's scripts; the installed app and a build step start nothing. */
export function startPreferredSampleDownload(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!isDesktopShell()) void bundledSamples.load(getSampleSourceSnapshot());
  } catch {
    // A failed check starts nothing; the screen's own demand decides later.
  }
}
