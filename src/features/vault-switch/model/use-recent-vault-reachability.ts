'use client';

import { useEffect, useState } from 'react';
import {
  verifyHandlePermission,
  type LocalFsHandleRecord,
} from '@/entities/local-fs-handle';
import { isMissingFolderError } from '@/entities/vault-session';
import { isTauriVaultRuntime, tauriVaultPathExists } from '@/shared/lib/tauri-vault-fs';
import {
  recentVaultRowKey,
  type RecentVaultReachability,
} from '../lib/recent-vault-row';

/**
 * Probes each stored folder for whether it can be opened now, **without asking the person
 * for anything**.
 *
 * Both runtimes can answer gesture-free, which is the only reason a row can state its
 * condition before it is pressed:
 *
 * - **Installed app** - `vault_path_exists` on the stored absolute path. A renamed, moved
 *   or unmounted folder answers false. There is no permission layer to consult: the app
 *   reads the path directly.
 * - **Browser** - `queryPermission`, which is explicitly the non-prompting half of the File
 *   System Access API. `granted` needs nothing, `prompt` means the press itself will ask,
 *   and `denied` means the press will not be allowed to.
 *
 * `requestPermission` is **never** called here. It needs a user gesture, so calling it
 * while drawing a list would either throw or, worse, put a permission dialog on screen
 * that the person did not ask for.
 */
export function useRecentVaultReachability(
  records: ReadonlyArray<LocalFsHandleRecord>,
): Record<string, RecentVaultReachability> {
  const [states, setStates] = useState<Record<string, RecentVaultReachability>>({});
  /*
   * The dependency is the key list, not the array: `recentVaults` is rebuilt on every
   * refresh, so depending on the array itself re-probes every folder whenever anything
   * touches the list - including a refresh that a press on one row triggers.
   */
  const identity = records.map(recentVaultRowKey).join(' ');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const desktop = isTauriVaultRuntime();
      const entries = await Promise.all(
        records.map(async (record): Promise<[string, RecentVaultReachability]> => {
          const key = recentVaultRowKey(record);
          try {
            const rootPath = record.desktopRootPath;
            if (desktop && rootPath) {
              const exists = await tauriVaultPathExists(rootPath, 'directory');
              return [key, exists ? 'ready' : 'missing'];
            }
            if (!record.handle) return [key, 'unknown'];
            const permission = await verifyHandlePermission(record.handle, 'read');
            if (permission === 'granted') return [key, 'ready'];
            if (permission === 'denied') return [key, 'blocked'];
            return [key, 'needs-permission'];
          } catch (error) {
            /*
             * ⚠️ **On the desktop, "the folder is gone" arrives as a rejection, not as
             * `false`** (workbench seat, 2026-09-13). `vault_path_exists` calls
             * `canonical_root` before its own NotFound branch (`src-tauri/src/lib.rs:2702`),
             * and `canonical_root` maps every `canonicalize` error to `Err`
             * (`src-tauri/src/lib.rs:267`). So a renamed, moved or unmounted folder - the
             * single most common stale handle, and the one this type exists for - threw, was
             * called `unknown`, and stayed pressable until it failed on press. Reading the
             * exception is what the web arm already does for the same fact, through the same
             * classifier.
             */
            if (isMissingFolderError(error)) return [key, 'missing'];
            /*
             * Anything else is reported as `unknown`, never as `ready`. The row stays
             * pressable and says the condition could not be read - the honest answer, where
             * a silent `ready` would be a promise the app cannot keep.
             */
            return [key, 'unknown'];
          }
        }),
      );
      if (cancelled) return;
      setStates(Object.fromEntries(entries));
    })().catch(() => {
      /* An unreadable list is not a failed screen; every row falls back to `unknown`. */
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `identity`, see above.
  }, [identity]);

  return states;
}
