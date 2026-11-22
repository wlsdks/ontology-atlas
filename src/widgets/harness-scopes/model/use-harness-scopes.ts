'use client';

import { useCallback, useEffect, useState } from 'react';

import { resolveSourceBinding } from '@/features/harness-report';
import { failureCodeOf } from '@/shared/lib/failures/failure-code';
import {
  pickHarnessScopeFile,
  readHarnessScopes,
  type HarnessScopes,
  type PickOutcome,
} from '@/shared/lib/harness-scopes/tauri-harness-scopes';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';

/**
 * The agent settings of every scope for the connected repository, read through the app's bridge.
 * The browser and a folder with no connected repository get `unavailable`: nothing is read there.
 */
export type HarnessScopesState =
  | { status: 'unavailable' }
  | { status: 'reading' }
  | { status: 'ready'; scopes: HarnessScopes }
  | { status: 'failed'; code: string | null };

interface Snapshot {
  key: string;
  state: HarnessScopesState;
}

export interface HarnessScopesRead {
  state: HarnessScopesState;
  /** The last pick's answer, until the next pick or read. */
  lastPick: PickOutcome | null;
  /** Opens the native picker; a held file is read with the others. */
  pick: (dialogTitle: string) => Promise<void>;
}

export function useHarnessScopes(
  handle: FileSystemDirectoryHandle | null,
  projectSlugs: readonly string[],
  enabled: boolean,
  /** Bumped by Read files again. */
  reloadNonce: number,
): HarnessScopesRead {
  const vaultPath = handle ? (getTauriVaultRootPath(handle) ?? null) : null;
  const slugKey = projectSlugs.join('\0');
  const active = enabled && handle !== null && vaultPath !== null;
  const [pickNonce, setPickNonce] = useState(0);
  const [lastPick, setLastPick] = useState<PickOutcome | null>(null);
  const key = `${vaultPath ?? ''}\0${slugKey}\0${reloadNonce}\0${pickNonce}`;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!active || !handle || !vaultPath) return;
    let cancelled = false;
    void (async () => {
      try {
        const binding = await resolveSourceBinding(handle, slugKey ? slugKey.split('\0') : []);
        if (cancelled) return;
        if (!binding) {
          setSnapshot({ key, state: { status: 'unavailable' } });
          return;
        }
        const scopes = await readHarnessScopes(vaultPath, binding.projectSlug);
        if (cancelled) return;
        setSnapshot({ key, state: scopes ? { status: 'ready', scopes } : { status: 'unavailable' } });
      } catch (error) {
        if (!cancelled) setSnapshot({ key, state: { status: 'failed', code: failureCodeOf(error) } });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, handle, vaultPath, slugKey, key]);

  const pick = useCallback(async (dialogTitle: string) => {
    const outcome = await pickHarnessScopeFile(dialogTitle).catch(() => null);
    if (!outcome || outcome.outcome === 'cancelled') return;
    setLastPick(outcome);
    if (outcome.outcome === 'held') setPickNonce((n) => n + 1);
  }, []);

  /* The previous answer stays on screen while the next read runs, so a reread does not blank the page. */
  const state: HarnessScopesState =
    !active ? { status: 'unavailable' }
    : snapshot?.key === key ? snapshot.state
    : snapshot && snapshot.state.status === 'ready' ? snapshot.state
    : { status: 'reading' };
  return { state, lastPick, pick };
}
