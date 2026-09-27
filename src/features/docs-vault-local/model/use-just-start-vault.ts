import { useCallback, useState } from 'react';
import { codedFailure, failureCodeOf } from '@/shared/lib/failure-code';
import type { VaultShape } from '@/shared/lib/vault-shape';
import { CURRENT_LOCAL_FS_HANDLE_ID, type LocalFsHandleRecord } from '@/entities/local-fs-handle';
import type { VaultOpenOptions, VaultOpenResult } from '@/entities/vault-session';
import {
  createTauriVaultHandle,
  ensureDefaultVaultParentDir,
  ensureTauriChildDirectory,
  listTauriDirectoryNames,
} from '@/shared/lib/tauri-vault-fs';
import { buildDefaultVaultDisplayPath, resolveUniqueVaultDirName } from '../lib/default-vault-naming';
import type { CreationReport } from './use-vault-create-flow';

export interface JustStartReport extends CreationReport {
  /** Receives how the screen names the new folder. */
  created?: (displayPath: string) => void;
}

/**
 * The narrow part of `useLocalVault()` this hook needs, so a test double satisfies it.
 */
export interface JustStartVaultVault {
  openRecent: (record: LocalFsHandleRecord, options?: VaultOpenOptions) => Promise<VaultOpenResult>;
}

/**
 * "Just start" on the desktop: creates a real folder under `~/Ontology Atlas/<name>` and opens it.
 * Not OPFS, so agents, MCP and Claude Code can reach it. The starter rides inside the open
 * (`openRecent(record, { starter })`): the shell unmounts this screen as the open begins, so
 * nothing may wait for a later render. Later outcomes go through `report`; `actionError` covers
 * only folder preparation. `starterLocale` writes the starter in the screen's language.
 */
export function useJustStartVault(
  vault: JustStartVaultVault,
  starterLocale: string,
  report: JustStartReport = {},
) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { created, starterFailed } = report;

  /** `null` keeps the full starter. */
  const justStart = useCallback(async (chosen: VaultShape | null = null) => {
    setActionError(null);
    setBusy(true);
    try {
      const parentDir = await ensureDefaultVaultParentDir();
      if (!parentDir) {
        throw codedFailure('app-required');
      }
      const existingNames = await listTauriDirectoryNames(parentDir);
      const dirName = resolveUniqueVaultDirName(existingNames);
      await ensureTauriChildDirectory(parentDir, dirName);
      const handle = createTauriVaultHandle(`${parentDir}/${dirName}`);
      const now = Date.now();
      const result = await vault.openRecent(
        {
          id: CURRENT_LOCAL_FS_HANDLE_ID,
          handle,
          name: handle.name,
          createdAt: now,
          lastAccessedAt: now,
        },
        { starter: { locale: starterLocale, shape: chosen ?? undefined } },
      );
      // A folder that did not open says so through the session's own error state.
      if (!result.opened) return;
      if (result.starterError !== null) {
        if (starterFailed) starterFailed(result.starterError);
        else setActionError(failureCodeOf(result.starterError) ?? '');
        return;
      }
      created?.(buildDefaultVaultDisplayPath(dirName));
    } catch (err) {
      /**
       * A failure code, not a sentence: `''` means nothing more specific; otherwise the screen looks
       * it up in `failures`, because a throwing module cannot know the reader's language.
       */
      setActionError(failureCodeOf(err) ?? '');
    } finally {
      setBusy(false);
    }
  }, [vault, starterLocale, created, starterFailed]);

  return { justStart, busy, actionError };
}
