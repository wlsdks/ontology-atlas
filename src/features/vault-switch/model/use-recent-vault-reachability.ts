'use client';

import { useEffect, useState } from 'react';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import { isMissingFolderError } from '@/entities/vault-session';
import { tauriVaultPathExists } from '@/shared/lib/vault-folder/native-vault/tauri-vault-files';
import {
  recentVaultRowKey,
  type RecentVaultReachability,
} from '../lib/recent-vault-row';

/** Past this deadline the list draws anyway, so one unresponsive network volume cannot hold it. */
const FIRST_ANSWER_DEADLINE_MS = 400;

/** Asks the native side whether each remembered path is still a folder; null until the first answer, so the list is drawn once in its real shape. */
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
      await Promise.all(
        records.map(async (record) => {
          const key = recentVaultRowKey(record);
          answers[key] = await probe(record);
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

async function probe(record: LocalFsHandleRecord): Promise<RecentVaultReachability> {
  const rootPath = record.desktopRootPath;
  if (!rootPath) return 'unknown';
  try {
    return (await tauriVaultPathExists(rootPath, 'directory')) ? 'ready' : 'missing';
  } catch (error) {
    /* A gone folder rejects: `canonical_root` errors before `vault_path_exists` returns false. */
    if (isMissingFolderError(error)) return 'missing';
    return 'unknown';
  }
}
