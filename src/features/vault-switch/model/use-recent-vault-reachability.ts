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
 * How long the list waits for the probe before it is drawn anyway.
 *
 * The probe answers in a few milliseconds on both runtimes (measured through the desktop bridge:
 * 27ms for five folders, the first painted frame included). A folder on a network volume that
 * stopped answering can hold `vault_path_exists` for seconds, and the rest of the list must not wait
 * for it: past this point the list is drawn, an unanswered row reads `unknown`, and its answer
 * lands when it comes.
 */
const FIRST_ANSWER_DEADLINE_MS = 400;

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
 *
 * ⚠️ **`null` until the first answer** (2026-09-26). The list used to draw every row as
 * `unknown` - pressable, with a "could not check" note - for the frames before the probe
 * answered, then redraw it. Once missing folders fold into one line at the end of the list,
 * that first frame would also be a different *shape*: five full rows collapsing to two and a
 * line. So the list is drawn once, from answers, and `null` tells it to wait. After the first
 * answer the value never goes back to `null`: forgetting a folder re-probes the rest while
 * the list stays on screen.
 */
export function useRecentVaultReachability(
  records: ReadonlyArray<LocalFsHandleRecord>,
): Record<string, RecentVaultReachability> | null {
  const [states, setStates] = useState<Record<string, RecentVaultReachability> | null>(null);
  /*
   * The dependency is the key list, not the array: `recentVaults` is rebuilt on every
   * refresh, so depending on the array itself re-probes every folder whenever anything
   * touches the list - including a refresh that a press on one row triggers.
   */
  const identity = records.map(recentVaultRowKey).join(' ');

  useEffect(() => {
    let cancelled = false;
    const answers: Record<string, RecentVaultReachability> = {};
    let drawn = false;
    const draw = () => {
      if (cancelled) return;
      drawn = true;
      setStates((current) => ({ ...(current ?? {}), ...answers }));
    };
    const deadline = window.setTimeout(draw, FIRST_ANSWER_DEADLINE_MS);
    (async () => {
      const desktop = isTauriVaultRuntime();
      await Promise.all(
        records.map(async (record) => {
          const key = recentVaultRowKey(record);
          answers[key] = await probe(record, desktop);
          // Past the deadline the list is already on screen; a late answer updates its row.
          if (drawn && !cancelled) setStates((current) => ({ ...(current ?? {}), [key]: answers[key] }));
        }),
      );
      window.clearTimeout(deadline);
      draw();
    })().catch(() => {
      /* An unreadable list is not a failed screen; every row falls back to `unknown`. */
      window.clearTimeout(deadline);
      draw();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(deadline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `identity`, see above.
  }, [identity]);

  return states;
}

async function probe(record: LocalFsHandleRecord, desktop: boolean): Promise<RecentVaultReachability> {
  try {
    const rootPath = record.desktopRootPath;
    if (desktop && rootPath) {
      const exists = await tauriVaultPathExists(rootPath, 'directory');
      return exists ? 'ready' : 'missing';
    }
    if (!record.handle) return 'unknown';
    const permission = await verifyHandlePermission(record.handle, 'read');
    if (permission === 'granted') return 'ready';
    if (permission === 'denied') return 'blocked';
    return 'needs-permission';
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
    if (isMissingFolderError(error)) return 'missing';
    /*
     * Anything else is reported as `unknown`, never as `ready`. The row stays
     * pressable and says the condition could not be read - the honest answer, where
     * a silent `ready` would be a promise the app cannot keep.
     */
    return 'unknown';
  }
}
