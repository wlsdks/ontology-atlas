'use client';

import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { bundledSamples, type StaticVaultSource } from '@/entities/docs-vault';
import { isDesktopShell } from '@/shared/lib/desktop-shell/desktop-shell';
import { getDataSourceMode } from '@/shared/lib/vault-folder/data-source-mode';
import { getSampleSourceSnapshot, type SampleSource } from '@/shared/lib/vault-folder/sample-source';
import { LocalVaultContext } from './local-vault-context';
import { useSampleSource } from './use-sample-source';

/**
 * `loading`: a web visitor's sample is on its way. `ready`: a sample is in hand. `failed`: it could
 * not be downloaded, even after a retry. `none`: nothing will load, because the installed app never
 * renders a bundled sample (docs/DECISIONS.md, 2026-08-30) or a vault has been chosen and the
 * sample is not wanted.
 */
export type StaticVaultStatus = 'loading' | 'ready' | 'failed' | 'none';

interface StaticVaultState {
  source: StaticVaultSource;
  status: StaticVaultStatus;
  sample: SampleSource;
  /** Starts the download if needed and returns a promise that settles when the sample has arrived or failed. */
  wait: () => Promise<unknown>;
  retry: () => void;
}

const getServerSnapshot = () => null;
const getServerState = () => 'idle' as const;
const settled = () => Promise.resolve();

/**
 * Reads the bundled sample the screen shows. With `demand` (the default) the first reader starts
 * its download; a reader that only wants whatever is there, like a closed palette, passes false so
 * a surface that never draws the sample never fetches it. While the next sample downloads, the
 * previous one stays in `source`, so a change of sample swaps in place; before any has arrived
 * `source` is the empty sample of the same name.
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

/**
 * Screen code must use this hook, not the bundled JSON, or it ignores the sample choice. In local
 * mode callers discard the value. `override` pins one sample regardless of the choice (the docs
 * screen's dogfood link). The value is empty until `useStaticVaultStatus()` says `ready`, and
 * stays empty in the installed app. See `entities/docs-vault/lib/bundled-vault/load-static-vault-source.ts`.
 */
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

/** What the hydration boundary needs: the status, a promise to suspend on, and a retry. */
export function useStaticVaultGate(override?: SampleSource): {
  status: StaticVaultStatus;
  wait: () => Promise<unknown>;
  retry: () => void;
} {
  const { status, wait, retry } = useStaticVaultState(override, true);
  return { status, wait, retry };
}

/**
 * Starts the preferred sample's download without a screen: a web route that is about to draw the
 * sample calls this when its code loads, so the download overlaps the rest of the page's scripts
 * instead of waiting for the first render. The installed app, which never draws a sample, starts
 * nothing, and neither does a build step.
 */
export function startPreferredSampleDownload(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!isDesktopShell()) void bundledSamples.load(getSampleSourceSnapshot());
  } catch {
    // A failed check starts nothing; the screen's own demand decides later.
  }
}
