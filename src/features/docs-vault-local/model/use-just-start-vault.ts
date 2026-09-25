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
  /** The folder opened with its starter. The argument is how the screen names the new folder. */
  created?: (displayPath: string) => void;
}

/**
 * The minimal shape of `useLocalVault()` that `useJustStartVault` requires — kept narrow so both the
 * real hook and a test double satisfy it (the same pattern as `VaultCreateFlowVault`).
 */
export interface JustStartVaultVault {
  openRecent: (record: LocalFsHandleRecord, options?: VaultOpenOptions) => Promise<VaultOpenResult>;
}

/**
 * "Just start" — Tauri desktop only. With no folder picker, it creates a real disk folder under
 * `~/Ontology Atlas/<name>` and connects to it immediately. **Not OPFS** — the whole point
 * of the design is that an agent, MCP, or Claude Code can reach it directly.
 *
 * The starter rides **inside the open** (`openRecent(record, { starter })`), not after it
 * (2026-09-25, D1). It used to be written by an effect waiting for this hook's next render once
 * `openRecent()` resolved, and that render never came: the shell swaps the first-run screen for the
 * opening pane the moment the open begins, and the root entry swaps that for the map. The folder
 * opened empty, with no error, every time. So nothing here waits for a render any more: the session
 * writes the starter before the folder is first shown, and the outcome comes back as a value.
 *
 * What happens after the open is told through `report`, because the screen that pressed the door is
 * gone by then; `actionError` covers only what fails while it is still on the glass (preparing the
 * folder). `starterLocale` follows the same contract as `useVaultCreateFlow` — whichever creation
 * path is taken, the starter must come out in the screen's language (walkthrough 2026-07-26).
 */
export function useJustStartVault(
  vault: JustStartVaultVault,
  starterLocale: string,
  report: JustStartReport = {},
) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { created, starterFailed } = report;

  /** `chosen` is what the person said the folder will hold; `null` keeps the full starter. */
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
       * `actionError` carries a **failure code**, not a sentence.
       *
       * `''` still means "it failed and there is nothing more specific to say"; a non-empty value is a
       * code the screen looks up in the `failures` catalogue. It used to be `err.message` — the
       * developer's English — which a Korean screen then printed verbatim (installed-app inspection
       * before v1.2.2, B2). A module that throws cannot know the reader's language, so it names the
       * failure and the screen owns the sentence.
       */
      setActionError(failureCodeOf(err) ?? '');
    } finally {
      setBusy(false);
    }
  }, [vault, starterLocale, created, starterFailed]);

  return { justStart, busy, actionError };
}
