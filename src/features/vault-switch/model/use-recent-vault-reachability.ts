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

/** Past this deadline the list draws anyway, so one unresponsive network volume cannot hold it. */
const FIRST_ANSWER_DEADLINE_MS = 400;

/**
 * Probes each stored folder without asking the person for anything: `vault_path_exists` in the
 * app, `queryPermission` in a browser; never `requestPermission`, which needs a gesture. Null
 * until the first answer, so the list is drawn once in its real shape.
 */
export function useRecentVaultReachability(
  records: ReadonlyArray<LocalFsHandleRecord>,
): Record<string, RecentVaultReachability> | null {
  const [states, setStates] = useState<Record<string, RecentVaultReachability> | null>(null);
  /* Keyed on the row keys, since `recentVaults` is rebuilt on every refresh. */
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
    /* On the desktop a gone folder rejects: `canonical_root` errors before `vault_path_exists` returns false. */
    if (isMissingFolderError(error)) return 'missing';
    /* Anything else is `unknown`, never `ready`. */
    return 'unknown';
  }
}
